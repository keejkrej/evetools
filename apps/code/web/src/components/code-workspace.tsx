"use client";

import {
  CODE_MODEL,
  MODELS,
  type ModelOption,
} from "@evetools/models";
import { Client, type ClientSessionState, type MessageStreamEvent } from "eve/client";
import {
  useEveAgent,
  type EveDynamicToolPart,
  type EveMessage,
  type EveMessageInputRequest,
  type EveMessagePart,
} from "eve/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSavedEveSession, savedEveSession } from "@/lib/eve-session";

type WorkspaceChange = {
  path: string;
  index: string;
  workingTree: string;
  originalPath?: string;
};
type Workspace = {
  configured: true;
  name: string;
  root: string;
  files: string[];
  changes: WorkspaceChange[];
};
type Panel = { kind: "changes" } | { kind: "file"; path: string } | { kind: "diff"; path: string };
type SavedConversation = {
  events?: readonly MessageStreamEvent[];
  restoreError?: string;
  session?: ClientSessionState;
};

const CONVERSATION_KEY = "evecode-web-conversation-v1";
const MODEL_KEY = "evetools-code-model-v2";

async function readSavedConversation(signal: AbortSignal): Promise<SavedConversation> {
  const saved = parseSavedEveSession(localStorage.getItem(CONVERSATION_KEY));
  if (!saved) return {};
  try {
    return await new Client({ host: "" })
      .sessions.attach(saved.sessionId, { streamIndex: 0 })
      .snapshot({ signal });
  } catch (error) {
    if (signal.aborted) throw error;
    const message = error instanceof Error ? error.message : "Unknown replay error.";
    return { restoreError: `The previous Eve session could not be restored: ${message}` };
  }
}

export function CodeWorkspace() {
  const [saved, setSaved] = useState<SavedConversation | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void readSavedConversation(controller.signal).then((conversation) => {
      if (!controller.signal.aborted) setSaved(conversation);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (saved === null) {
    return <main className="setup-screen"><div className="setup-card">Starting Evecode…</div></main>;
  }

  return (
    <SessionWorkspace
      initialConversation={saved}
      key={generation}
      onNewSession={() => {
        localStorage.removeItem(CONVERSATION_KEY);
        setSaved({});
        setGeneration((value) => value + 1);
      }}
    />
  );
}

function SessionWorkspace({
  initialConversation,
  onNewSession,
}: {
  initialConversation: SavedConversation;
  onNewSession: () => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [input, setInput] = useState("");
  const [panel, setPanel] = useState<Panel | null>({ kind: "changes" });
  const [panelContent, setPanelContent] = useState("");
  const [panelLoading, setPanelLoading] = useState(false);
  const [workspaceChanges, setWorkspaceChanges] = useState<WorkspaceChange[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [model, setModel] = useState(CODE_MODEL);
  const [models, setModels] = useState<readonly ModelOption[]>(MODELS);
  const timelineRef = useRef<HTMLDivElement>(null);

  const agent = useEveAgent({
    initialEvents: initialConversation.events,
    initialSession: initialConversation.session,
    prepareSend: (turn) => ({
      ...turn,
      clientContext: { evecode: { model } },
    }),
  });
  const busy = agent.status === "submitted" || agent.status === "streaming";

  useEffect(() => {
    if (agent.session) {
      localStorage.setItem(CONVERSATION_KEY, JSON.stringify(savedEveSession(agent.session)));
    }
  }, [agent.session]);

  useEffect(() => {
    void fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Workspace unavailable.");
        setWorkspace(body as Workspace);
        setWorkspaceChanges((body as Workspace).changes ?? []);
      })
      .catch((error: Error) => setWorkspaceError(error.message));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const savedModel = localStorage.getItem(MODEL_KEY);
    if (savedModel && MODELS.some((item) => item.id === savedModel)) {
      setModel(savedModel);
    }
    void fetch("/api/models", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load models.");
        return response.json() as Promise<{ models?: ModelOption[] }>;
      })
      .then((payload) => {
        if (!payload.models?.length) return;
        setModels(payload.models);
        setModel((current) => {
          const stored = localStorage.getItem(MODEL_KEY);
          if (stored && payload.models!.some((item) => item.id === stored)) return stored;
          return payload.models!.some((item) => item.id === current) ? current : payload.models![0].id;
        });
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setModels(MODELS);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" });
  }, [agent.data.messages]);

  const openPanel = useCallback(async (next: Panel) => {
    setPanel(next);
    setPanelLoading(true);
    try {
      const query = next.kind === "changes"
        ? "view=diff"
        : next.kind === "diff"
          ? `view=diff&file=${encodeURIComponent(next.path)}`
          : `file=${encodeURIComponent(next.path)}`;
      const response = await fetch(`/api/workspace?${query}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load workspace data.");
      setPanelContent(next.kind === "file" ? body.content : body.diff);
      if (next.kind === "changes") setWorkspaceChanges(body.changes ?? []);
    } catch (error) {
      setPanelContent(error instanceof Error ? error.message : "Could not load workspace data.");
    } finally {
      setPanelLoading(false);
    }
  }, []);

  useEffect(() => { void openPanel({ kind: "changes" }); }, [openPanel]);

  const pendingRequests = useMemo(() => agent.data.messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type !== "dynamic-tool" || part.state !== "approval-requested") return [];
      const request = part.toolMetadata?.eve?.inputRequest;
      return request ? [{ part, request }] : [];
    })), [agent.data.messages]);

  const title = useMemo(() => {
    for (const message of agent.data.messages) {
      if (message.role !== "user") continue;
      const text = message.parts.find((part) => part.type === "text");
      if (text?.type === "text" && text.text.trim()) return text.text.trim().slice(0, 52);
    }
    return "New session";
  }, [agent.data.messages]);

  async function send() {
    const prompt = input.trim();
    if (!prompt || busy || !workspace) return;
    setInput("");
    await agent.send(prompt).catch(() => undefined);
    if (panel?.kind === "changes") void openPanel({ kind: "changes" });
  }

  async function answerRequest(request: EveMessageInputRequest, optionId?: string) {
    if (optionId) {
      await agent.respond([{ requestId: request.requestId, optionId }]).catch(() => undefined);
      return;
    }
    const text = window.prompt(request.prompt)?.trim();
    if (text) await agent.respond([{ requestId: request.requestId, text }]).catch(() => undefined);
  }

  const groupedFiles = workspace?.files ?? [];
  const changesByPath = useMemo(
    () => new Map(workspaceChanges.map((change) => [change.path, change])),
    [workspaceChanges],
  );

  if (workspaceError) {
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <span className="brand-mark">E</span>
          <p className="eyebrow">Evecode setup</p>
          <h1>Workspace unavailable</h1>
          <p>Launch Evecode with a readable and writable workspace directory.</p>
          <p className="error-text">{workspaceError}</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`app-shell ${panel ? "panel-open" : ""}`}>
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
        <div className="sidebar-header">
          <span className="brand-mark">E</span>
          {sidebarOpen && <strong>Evecode</strong>}
          <button className="icon-button push-right" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle sidebar">{sidebarOpen ? "‹" : "›"}</button>
        </div>
        {sidebarOpen && <>
          <button className="new-thread" disabled={busy} onClick={onNewSession}><span>＋</span> New session</button>
          <div className="project-heading"><span className="status-dot" />{workspace?.name ?? "Loading workspace…"}</div>
          <div className="thread-list">
            <div className="thread-row active">
              <div className="session-row">
                <span className={`thread-status ${busy ? "working" : agent.status === "error" ? "error" : ""}`} />
                <span><strong>{title}</strong><small>Durable Eve session</small></span>
              </div>
            </div>
          </div>
          <div className="sidebar-footer"><span>Shared core</span><span className={busy ? "working-summary" : "online"}>{busy ? "● Working" : "● Eve ready"}</span></div>
        </>}
      </aside>

      <section className="conversation-column">
        <header className="topbar">
          <div><small>{workspace?.name ?? "Workspace"}</small><strong>{title}</strong></div>
          <button className={`tab-button ${panel?.kind === "changes" ? "selected" : ""}`} onClick={() => void openPanel({ kind: "changes" })}>Changes</button>
        </header>
        <div className="timeline" ref={timelineRef}>
          {!agent.data.messages.length ? (
            <div className="empty-thread"><span className="brand-mark large">E</span><p className="eyebrow">{workspace?.name}</p><h1>What should we work on?</h1><p>The web and terminal interfaces run the same Evecode agent.</p></div>
          ) : agent.data.messages.map((message) => <MessageView key={message.id} message={message} />)}
        </div>
        <div className="composer-wrap">
          {(initialConversation.restoreError || agent.error) && <div className="approval-error"><span>{initialConversation.restoreError ?? agent.error?.message}</span></div>}
          {pendingRequests.map(({ part, request }) => (
            <div className="approval-card" key={request.requestId}>
              <div>
                <span className="approval-kind">{request.kind === "tool-approval" ? "Approval required" : "Input required"}</span>
                <strong>{request.prompt}</strong>
                <code>{formatUnknown(part.input)}</code>
              </div>
              <div className="approval-actions">
                {request.options?.map((option) => (
                  <button className={option.style === "primary" ? "approve" : ""} key={option.id} onClick={() => void answerRequest(request, option.id)}>{option.label}</button>
                ))}
                {request.allowFreeform && <button onClick={() => void answerRequest(request)}>Answer…</button>}
              </div>
            </div>
          ))}
          <div className="composer">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask Eve to work on this codebase…" rows={3} />
            <div className="composer-actions">
              <span>{workspace?.root ?? "Connecting…"}</span>
              <label className="model-picker" title="Model">
                <span>Model</span>
                <select value={model} onChange={(event) => { setModel(event.target.value); localStorage.setItem(MODEL_KEY, event.target.value); }} disabled={busy}>
                  {models.map((item) => <option key={item.id} title={item.description} value={item.id}>{item.displayName}</option>)}
                </select>
              </label>
              {busy
                ? <button className="send-button stop" onClick={() => void agent.cancel()} aria-label="Stop active turn">■</button>
                : <button className="send-button" disabled={!input.trim() || !workspace} onClick={() => void send()}>↑</button>}
            </div>
          </div>
        </div>
      </section>

      {panel && <aside className="context-panel">
        <header><strong>{panel.kind === "changes" ? "Changes" : panel.path}</strong><button className="icon-button" onClick={() => setPanel(null)}>×</button></header>
        <div className="panel-body">
          {panel.kind === "changes" && <div className="file-browser"><p className="eyebrow">Files</p>{groupedFiles.map((file) => {
            const change = changesByPath.get(file);
            const status = change ? `${change.index}${change.workingTree}`.trim() || "?" : "";
            return <button key={file} onClick={() => void openPanel(change ? { kind: "diff", path: file } : { kind: "file", path: file })}><span>{file}</span>{status && <b>{status}</b>}</button>;
          })}</div>}
          <pre className="code-view">{panelLoading ? "Loading…" : panelContent}</pre>
        </div>
      </aside>}
    </main>
  );
}

function MessageView({ message }: { message: EveMessage }) {
  return (
    <article className={`message ${message.role}`}>
      <div className="message-label">{message.role === "user" ? "You" : "Eve"}</div>
      {message.parts.map((part, index) => <MessagePart key={`${message.id}:${index}`} part={part} />)}
      {message.metadata?.status === "streaming" && <span className="streaming-dots">•••</span>}
    </article>
  );
}

function MessagePart({ part }: { part: EveMessagePart }) {
  if (part.type === "text") return <div className="message-content">{part.text}</div>;
  if (part.type === "reasoning") return <details><summary>Reasoning</summary><p className="message-content">{part.text}</p></details>;
  if (part.type === "dynamic-tool") return <ToolPart part={part} />;
  if (part.type === "file") return <div className="tool-row"><code>{part.filename ?? "Attachment"}</code><span>{part.mediaType}</span></div>;
  if (part.type === "authorization") {
    return <div className="approval-card"><div><span className="approval-kind">Authorization</span><strong>{part.displayName}</strong><code>{part.description}</code></div>{part.state === "required" && part.authorization?.url ? <a href={part.authorization.url} rel="noreferrer" target="_blank">Sign in</a> : null}</div>;
  }
  return null;
}

function ToolPart({ part }: { part: EveDynamicToolPart }) {
  const failed = part.state === "output-error" || part.state === "output-denied";
  const complete = part.state === "output-available";
  const name = part.toolMetadata?.eve?.name ?? part.toolName;
  return <div className="tool-row"><span className={`tool-state ${failed ? "error" : complete ? "complete" : ""}`} /><code>{name}</code><span>{failed ? "error" : complete ? "complete" : "running"}</span></div>;
}

function formatUnknown(value: unknown): string {
  if (value === undefined) return "";
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text;
  } catch {
    return String(value);
  }
}
