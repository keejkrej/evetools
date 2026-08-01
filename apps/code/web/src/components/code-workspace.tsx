"use client";

import { decodeEveStream, type EveAgentEvent, type EveToolEvent } from "@evetools/agent";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  tools?: EveToolEvent[];
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

const THREADS_KEY = "evetools-code-threads-v1";
const ACTIVE_KEY = "evetools-code-active-thread-v1";

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
  const abortRef = useRef<AbortController | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const active = threads.find((thread) => thread.id === activeId) ?? null;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(THREADS_KEY) ?? "[]") as Thread[];
      const initial = saved.length ? saved : [newThread()];
      setThreads(initial);
      setActiveId(localStorage.getItem(ACTIVE_KEY) ?? initial[0].id);
    } catch {
      const initial = newThread();
      setThreads([initial]);
      setActiveId(initial.id);
    }
    void fetch("/api/workspace")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Workspace unavailable.");
        setWorkspace(body as Workspace);
      })
      .catch((error: Error) => setWorkspaceError(error.message));
  }, []);

  useEffect(() => {
    if (!threads.length) return;
    localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
  }, [threads]);
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);
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

  const removeThread = (id: string) => {
    if (!confirm("Delete this thread?")) return;
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

  async function send() {
    const prompt = input.trim();
    if (!prompt || !active || active.status === "working") return;
    const threadId = active.id;
    const user: Message = { id: crypto.randomUUID(), role: "user", content: prompt };
    const assistant: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const history = [...active.messages, user];
    setInput("");
    updateThread(threadId, (thread) => ({
      ...thread,
      title: thread.messages.length ? thread.title : prompt.slice(0, 48),
      messages: [...history, assistant],
      status: "working",
      updatedAt: Date.now(),
    }));
    const controller = new AbortController();
    abortRef.current = controller;
    let text = "";
    let reasoning = "";
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "auto",
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Eve could not start.");
      }
      for await (const event of decodeEveStream(response.body)) {
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "text") text += event.delta;
        if (event.type === "reasoning") reasoning += event.delta;
        updateThread(threadId, (thread) => ({
          ...thread,
          messages: thread.messages.map((message) => {
            if (message.id !== assistant.id) return message;
            if (event.type === "text") return { ...message, content: text };
            if (event.type === "reasoning") return { ...message, reasoning };
            const tools = message.tools ?? [];
            const index = tools.findIndex((tool) => tool.id === event.id);
            return { ...message, tools: index < 0 ? [...tools, event] : tools.map((tool, i) => i === index ? { ...tool, ...event } : tool) };
          }),
          updatedAt: Date.now(),
        }));
      }
      updateThread(threadId, (thread) => ({ ...thread, status: "idle", updatedAt: Date.now() }));
      if (panel?.kind === "changes") void openPanel({ kind: "changes" });
    } catch (error) {
      const stopped = controller.signal.aborted;
      updateThread(threadId, (thread) => ({
        ...thread,
        status: stopped ? "idle" : "error",
        messages: thread.messages.map((message) => message.id === assistant.id && !message.content
          ? { ...message, content: stopped ? "Stopped." : `Error: ${error instanceof Error ? error.message : "Eve failed."}` }
          : message),
        updatedAt: Date.now(),
      }));
    } finally {
      abortRef.current = null;
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
                <button className="delete-thread" onClick={() => removeThread(thread.id)} aria-label="Delete thread">×</button>
              </div>
            ))}
          </div>
          <div className="sidebar-footer"><span>Local workspace</span><span className="online">● Eve ready</span></div>
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
          <div className="composer">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask Eve to work on this codebase…" rows={3} />
            <div className="composer-actions"><span>{workspace?.root ?? "Connecting…"}</span>{active?.status === "working" ? <button className="send-button stop" onClick={() => abortRef.current?.abort()}>■</button> : <button className="send-button" disabled={!input.trim() || !workspace} onClick={() => void send()}>↑</button>}</div>
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

function MessageView({ message }: { message: Message }) {
  return <article className={`message ${message.role}`}>
    <div className="message-label">{message.role === "user" ? "You" : "Eve"}</div>
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
