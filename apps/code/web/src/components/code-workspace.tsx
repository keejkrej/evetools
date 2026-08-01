"use client";

import { decodeEveStream, type EveAgentEvent, type EveToolEvent, type EveTurnStatus } from "@evetools/agent";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  tools?: EveToolEvent[];
  turnId?: string;
  turnStatus?: EveTurnStatus;
  startedAt?: number;
  completedAt?: number;
  eventCursor?: number;
};
type Thread = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  status: "idle" | "working" | "error";
};
type Workspace = { configured: true; name: string; root: string; files: string[] };
type Panel = { kind: "changes" } | { kind: "file"; path: string };
type PermissionMode = "ask" | "trusted";
type Approval = {
  id: string;
  threadId: string;
  kind: "write_file" | "run_command";
  title: string;
  detail: string;
  createdAt: number;
};

const THREADS_KEY = "evetools-code-threads-v1";
const ACTIVE_KEY = "evetools-code-active-thread-v1";
const PERMISSION_KEY = "evetools-code-permission-v1";

const newThread = (): Thread => ({
  id: crypto.randomUUID(),
  title: "New thread",
  messages: [],
  updatedAt: Date.now(),
  status: "idle",
});

export function CodeWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [panel, setPanel] = useState<Panel | null>({ kind: "changes" });
  const [panelContent, setPanelContent] = useState("");
  const [panelLoading, setPanelLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("ask");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [approvalError, setApprovalError] = useState("");
  const [threadsHydrated, setThreadsHydrated] = useState(false);
  const [threadStorageError, setThreadStorageError] = useState("");
  const turnControllersRef = useRef(new Map<string, AbortController>());
  const reconnectingTurnsRef = useRef(new Set<string>());
  const timelineRef = useRef<HTMLDivElement>(null);

  const active = threads.find((thread) => thread.id === activeId) ?? null;
  const workingCount = threads.filter((thread) => thread.status === "working").length;

  useEffect(() => {
    setPermissionMode(localStorage.getItem(PERMISSION_KEY) === "trusted" ? "trusted" : "ask");
    const hydrateThreads = async () => {
      try {
        const response = await fetch("/api/threads", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load threads.");
        let initial = body.threads as Thread[];
        const local = JSON.parse(localStorage.getItem(THREADS_KEY) ?? "[]") as Thread[];
        if (!initial.length && local.length) {
          const migration = await fetch("/api/threads", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ threads: local.map((thread) => ({ ...thread, status: "idle" })) }),
          });
          const migrated = await migration.json();
          if (!migration.ok) throw new Error(migrated.error ?? "Could not migrate local threads.");
          initial = migrated.threads as Thread[];
          localStorage.removeItem(THREADS_KEY);
        }
        if (!initial.length) initial = [newThread()];
        const savedActive = localStorage.getItem(ACTIVE_KEY);
        setThreads(initial);
        setActiveId(initial.some((thread) => thread.id === savedActive) ? savedActive! : initial[0].id);
      } catch (error) {
        const initial = newThread();
        setThreads([initial]);
        setActiveId(initial.id);
        setThreadStorageError(error instanceof Error ? error.message : "Thread storage unavailable.");
      } finally {
        setThreadsHydrated(true);
      }
    };
    void hydrateThreads();
    void fetch("/api/workspace")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Workspace unavailable.");
        setWorkspace(body as Workspace);
      })
      .catch((error: Error) => setWorkspaceError(error.message));
  }, []);

  useEffect(() => () => {
    for (const controller of turnControllersRef.current.values()) controller.abort();
    turnControllersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!threadsHydrated || !threads.length) return;
    const timer = window.setTimeout(() => {
      void Promise.all(threads.map(async (thread) => {
        const response = await fetch(`/api/threads/${thread.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? `Could not save ${thread.title}.`);
        }
      })).then(() => setThreadStorageError(""), (error: Error) => setThreadStorageError(error.message));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [threads, threadsHydrated]);
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);
  useEffect(() => {
    localStorage.setItem(PERMISSION_KEY, permissionMode);
  }, [permissionMode]);
  useEffect(() => {
    if (!activeId || active?.status !== "working" || permissionMode !== "ask") {
      setApprovals([]);
      return;
    }
    let disposed = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/approvals?threadId=${encodeURIComponent(activeId)}`, { cache: "no-store" });
        const body = await response.json();
        if (!disposed && response.ok) setApprovals(body.approvals as Approval[]);
      } catch {
        // A transient polling failure must not interrupt the active turn.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 500);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [activeId, active?.status, permissionMode]);
  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages]);

  const updateThread = useCallback((id: string, update: (thread: Thread) => Thread) => {
    setThreads((current) => current.map((thread) => thread.id === id ? update(thread) : thread));
  }, []);

  const openPanel = useCallback(async (next: Panel) => {
    setPanel(next);
    setPanelLoading(true);
    try {
      const query = next.kind === "changes" ? "view=diff" : `file=${encodeURIComponent(next.path)}`;
      const response = await fetch(`/api/workspace?${query}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load workspace data.");
      setPanelContent(next.kind === "changes" ? body.diff : body.content);
    } catch (error) {
      setPanelContent(error instanceof Error ? error.message : "Could not load workspace data.");
    } finally {
      setPanelLoading(false);
    }
  }, []);

  useEffect(() => { void openPanel({ kind: "changes" }); }, [openPanel]);

  const createThread = () => {
    const thread = newThread();
    setThreads((current) => [thread, ...current]);
    setActiveId(thread.id);
    setInput("");
  };

  const stopThread = useCallback((id: string) => {
    const thread = threads.find((item) => item.id === id);
    const turnId = [...(thread?.messages ?? [])].reverse().find((message) => message.turnStatus === "running")?.turnId;
    if (turnId) void fetch(`/api/turns/${turnId}`, { method: "DELETE" });
    turnControllersRef.current.get(id)?.abort();
  }, [threads]);

  const removeThread = (id: string) => {
    if (!confirm("Delete this thread?")) return;
    stopThread(id);
    void fetch(`/api/threads/${id}`, { method: "DELETE" }).then(async (response) => {
      if (!response.ok && response.status !== 404) {
        const body = await response.json().catch(() => null);
        setThreadStorageError(body?.error ?? "Could not delete thread.");
      }
    }).catch((error: Error) => setThreadStorageError(error.message));
    setThreads((current) => {
      const remaining = current.filter((thread) => thread.id !== id);
      if (id === activeId) {
        const replacement = remaining[0] ?? newThread();
        setActiveId(replacement.id);
        return remaining.length ? remaining : [replacement];
      }
      return remaining;
    });
  };

  async function decideApproval(id: string, approved: boolean) {
    setApprovals((current) => current.filter((approval) => approval.id !== id));
    const response = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, approved }),
    });
    if (!response.ok && response.status !== 404) {
      const body = await response.json().catch(() => null);
      setApprovalError(body?.error ?? "Could not submit approval decision.");
    }
  }

  const consumeTurn = useCallback(async (
    response: Response,
    threadId: string,
    assistantId: string,
    initial: { text?: string; reasoning?: string } = {},
  ): Promise<EveTurnStatus | null> => {
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "Eve turn is unavailable.");
    }
    let text = initial.text ?? "";
    let reasoning = initial.reasoning ?? "";
    let finalStatus: EveTurnStatus | null = null;
    let streamError = "";
    for await (const event of decodeEveStream(response.body)) {
      if (event.type === "error") {
        streamError = event.message;
        continue;
      }
      if (event.type === "text") text += event.delta;
      if (event.type === "reasoning") reasoning += event.delta;
      if (event.type === "lifecycle" && event.status !== "running") finalStatus = event.status;
      const sequence = "sequence" in event && typeof event.sequence === "number" ? event.sequence : undefined;
      updateThread(threadId, (thread) => ({
        ...thread,
        status: event.type === "lifecycle" && event.status === "failed" ? "error" : event.type === "lifecycle" && event.status !== "running" ? "idle" : thread.status,
        messages: thread.messages.map((message) => {
          if (message.id !== assistantId) return message;
          const cursor = sequence === undefined ? message.eventCursor : Math.max(message.eventCursor ?? 0, sequence);
          if (event.type === "text") return { ...message, content: text, eventCursor: cursor };
          if (event.type === "reasoning") return { ...message, reasoning, eventCursor: cursor };
          if (event.type === "lifecycle") return {
            ...message,
            turnId: event.turnId,
            turnStatus: event.status,
            startedAt: event.status === "running" ? event.at : message.startedAt,
            completedAt: event.status === "running" ? undefined : event.at,
            eventCursor: cursor,
          };
          const tools = message.tools ?? [];
          const index = tools.findIndex((tool) => tool.id === event.id);
          return { ...message, eventCursor: cursor, tools: index < 0 ? [...tools, event] : tools.map((tool, i) => i === index ? { ...tool, ...event } : tool) };
        }),
        updatedAt: Date.now(),
      }));
    }
    if (streamError) throw new Error(streamError);
    return finalStatus;
  }, [updateThread]);

  useEffect(() => {
    if (!threadsHydrated) return;
    for (const thread of threads) {
      const message = [...thread.messages].reverse().find((item) => item.turnStatus === "running" && item.turnId);
      if (!message?.turnId || reconnectingTurnsRef.current.has(message.turnId) || turnControllersRef.current.has(thread.id)) continue;
      reconnectingTurnsRef.current.add(message.turnId);
      const controller = new AbortController();
      turnControllersRef.current.set(thread.id, controller);
      const after = message.eventCursor ?? 0;
      void fetch(`/api/turns/${message.turnId}/stream?after=${after}`, { signal: controller.signal })
        .then((response) => consumeTurn(response, thread.id, message.id, { text: message.content, reasoning: message.reasoning }))
        .catch((error: Error) => {
          if (controller.signal.aborted) return;
          updateThread(thread.id, (current) => ({
            ...current,
            status: "error",
            messages: current.messages.map((item) => item.id === message.id ? { ...item, turnStatus: "failed", completedAt: Date.now(), content: item.content || `Error: ${error.message}` } : item),
            updatedAt: Date.now(),
          }));
        })
        .finally(() => {
          reconnectingTurnsRef.current.delete(message.turnId!);
          if (turnControllersRef.current.get(thread.id) === controller) turnControllersRef.current.delete(thread.id);
        });
    }
  }, [consumeTurn, threads, threadsHydrated, updateThread]);

  async function send() {
    const prompt = input.trim();
    if (!prompt || !active || active.status === "working") return;
    const threadId = active.id;
    const turnId = crypto.randomUUID();
    const user: Message = { id: crypto.randomUUID(), role: "user", content: prompt };
    const assistant: Message = { id: crypto.randomUUID(), role: "assistant", content: "", turnId, turnStatus: "running", startedAt: Date.now() };
    const history = [...active.messages, user];
    setInput("");
    const runningThread: Thread = {
      ...active,
      title: active.messages.length ? active.title : prompt.slice(0, 48),
      messages: [...history, assistant],
      status: "working",
      updatedAt: Date.now(),
    };
    updateThread(threadId, () => runningThread);
    const controller = new AbortController();
    turnControllersRef.current.set(threadId, controller);
    try {
      const persisted = await fetch(`/api/threads/${threadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread: runningThread }),
        signal: controller.signal,
      });
      if (!persisted.ok) {
        const body = await persisted.json().catch(() => null);
        throw new Error(body?.error ?? "Could not persist the turn before starting.");
      }
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "auto",
          threadId,
          turnId,
          permissionMode,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });
      const finalStatus = await consumeTurn(response, threadId, assistant.id);
      if (!finalStatus) throw new Error("Turn stream ended without a completion event.");
      if (panel?.kind === "changes") void openPanel({ kind: "changes" });
    } catch (error) {
      let failure = error;
      const stopped = controller.signal.aborted;
      if (!stopped) {
        try {
          const replay = await fetch(`/api/turns/${turnId}/stream`, { signal: controller.signal });
          const finalStatus = await consumeTurn(replay, threadId, assistant.id);
          if (finalStatus) return;
        } catch (reconnectError) {
          failure = reconnectError;
        }
      }
      updateThread(threadId, (thread) => ({
        ...thread,
        status: stopped ? "idle" : "error",
        messages: thread.messages.map((message) => message.id === assistant.id
          ? {
              ...message,
              content: message.content || (stopped ? "Stopped." : `Error: ${failure instanceof Error ? failure.message : "Eve failed."}`),
              turnStatus: stopped ? "stopped" : "failed",
              completedAt: Date.now(),
            }
          : message),
        updatedAt: Date.now(),
      }));
    } finally {
      if (turnControllersRef.current.get(threadId) === controller) turnControllersRef.current.delete(threadId);
    }
  }

  const groupedFiles = useMemo(() => workspace?.files ?? [], [workspace]);

  if (workspaceError) {
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <span className="brand-mark">E</span>
          <p className="eyebrow">Evecode setup</p>
          <h1>Choose a workspace</h1>
          <p>Set <code>EVECODE_WORKSPACE_ROOT</code> to an absolute local project path, then restart Evecode.</p>
          <pre>EVECODE_WORKSPACE_ROOT=/path/to/project pnpm dev:code</pre>
          <p className="error-text">{workspaceError}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <div className="sidebar-header">
          <span className="brand-mark">E</span>
          {sidebarOpen && <strong>Evecode</strong>}
          <button className="icon-button push-right" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle sidebar">{sidebarOpen ? "‹" : "›"}</button>
        </div>
        {sidebarOpen && <>
          <button className="new-thread" onClick={createThread}><span>＋</span> New thread</button>
          <div className="project-heading"><span className="status-dot" />{workspace?.name ?? "Loading workspace…"}</div>
          <div className="thread-list">
            {threads.map((thread) => (
              <div className={`thread-row ${thread.id === activeId ? "active" : ""}`} key={thread.id}>
                <button onClick={() => setActiveId(thread.id)}>
                  <span className={`thread-status ${thread.status}`} />
                  <span><strong>{thread.title}</strong><small>{new Date(thread.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></span>
                </button>
                {thread.status === "working"
                  ? <button className="delete-thread stop-thread" onClick={() => stopThread(thread.id)} aria-label={`Stop ${thread.title}`}>■</button>
                  : <button className="delete-thread" onClick={() => removeThread(thread.id)} aria-label="Delete thread">×</button>}
              </div>
            ))}
          </div>
          <div className="sidebar-footer"><span>Local workspace</span><span className={workingCount ? "working-summary" : "online"}>{workingCount ? `● ${workingCount} working` : "● Eve ready"}</span></div>
        </>}
      </aside>

      <section className="conversation-column">
        <header className="topbar">
          <div><small>{workspace?.name ?? "Workspace"}</small><strong>{active?.title ?? "New thread"}</strong></div>
          <button className={`tab-button ${panel?.kind === "changes" ? "selected" : ""}`} onClick={() => void openPanel({ kind: "changes" })}>Changes</button>
        </header>
        <div className="timeline" ref={timelineRef}>
          {!active?.messages.length ? (
            <div className="empty-thread"><span className="brand-mark large">E</span><p className="eyebrow">{workspace?.name}</p><h1>What should we work on?</h1><p>Ask Eve to inspect, explain, change, or validate this project.</p></div>
          ) : active.messages.map((message) => <MessageView key={message.id} message={message} />)}
        </div>
        <div className="composer-wrap">
          {threadStorageError && <div className="approval-error">Thread persistence: {threadStorageError}<button onClick={() => setThreadStorageError("")}>×</button></div>}
          {approvalError && <div className="approval-error">{approvalError}<button onClick={() => setApprovalError("")}>×</button></div>}
          {approvals.map((approval) => (
            <div className="approval-card" key={approval.id}>
              <div><span className="approval-kind">Approval required</span><strong>{approval.title}</strong><code>{approval.detail}</code></div>
              <div className="approval-actions"><button onClick={() => void decideApproval(approval.id, false)}>Deny</button><button className="approve" onClick={() => void decideApproval(approval.id, true)}>Approve</button></div>
            </div>
          ))}
          <div className="composer">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask Eve to work on this codebase…" rows={3} />
            <div className="composer-actions">
              <span>{workspace?.root ?? "Connecting…"}</span>
              <label className="permission-mode" title="Ask requires approval before writes and commands">
                <span>Permissions</span>
                <select value={permissionMode} onChange={(event) => setPermissionMode(event.target.value as PermissionMode)} disabled={active?.status === "working"}>
                  <option value="ask">Ask</option>
                  <option value="trusted">Trusted</option>
                </select>
              </label>
              {active?.status === "working" ? <button className="send-button stop" onClick={() => stopThread(active.id)} aria-label="Stop active turn">■</button> : <button className="send-button" disabled={!input.trim() || !workspace} onClick={() => void send()}>↑</button>}
            </div>
          </div>
        </div>
      </section>

      {panel && <aside className="context-panel">
        <header><strong>{panel.kind === "changes" ? "Changes" : panel.path}</strong><button className="icon-button" onClick={() => setPanel(null)}>×</button></header>
        <div className="panel-body">
          {panel.kind === "changes" && <div className="file-browser"><p className="eyebrow">Files</p>{groupedFiles.map((file) => <button key={file} onClick={() => void openPanel({ kind: "file", path: file })}>{file}</button>)}</div>}
          <pre className="code-view">{panelLoading ? "Loading…" : panelContent}</pre>
        </div>
      </aside>}
    </main>
  );
}

function turnStatusLabel(status: EveTurnStatus, startedAt?: number, completedAt?: number) {
  if (status === "running") return "Working";
  const duration = startedAt && completedAt ? ` · ${Math.max(0, (completedAt - startedAt) / 1000).toFixed(1)}s` : "";
  return `${status[0].toUpperCase()}${status.slice(1)}${duration}`;
}

function MessageView({ message }: { message: Message }) {
  return <article className={`message ${message.role}`}>
    <div className="message-label">{message.role === "user" ? "You" : "Eve"}</div>
    {message.role === "assistant" && message.turnStatus && <div className={`turn-status ${message.turnStatus}`}>{turnStatusLabel(message.turnStatus, message.startedAt, message.completedAt)}</div>}
    {message.reasoning && <details><summary>Reasoning</summary><p>{message.reasoning}</p></details>}
    {message.tools?.map((tool) => {
      const skillName = tool.name === "load_skill" && tool.input && typeof tool.input === "object" && "name" in tool.input
        ? String(tool.input.name)
        : null;
      return <div className="tool-row" key={tool.id}><span className={`tool-state ${tool.status}`} /> <code>{skillName ? `skill: ${skillName}` : tool.name}</code><span>{tool.status}</span></div>;
    })}
    <div className="message-content">{message.content || (message.role === "assistant" ? <span className="streaming-dots">•••</span> : null)}</div>
  </article>;
}
