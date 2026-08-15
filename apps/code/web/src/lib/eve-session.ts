import type { ClientSessionState } from "eve/client";

export type SavedEveSession = {
  sessionId: string;
  streamIndex: 0;
};

export function savedEveSession(session: ClientSessionState): SavedEveSession {
  return { sessionId: session.sessionId, streamIndex: 0 };
}

export function parseSavedEveSession(value: string | null): SavedEveSession | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as {
      sessionId?: unknown;
      session?: { sessionId?: unknown };
    };
    // The nested shape migrates the first shared-core preview, which persisted
    // the complete event log alongside its cursor.
    const sessionId = typeof parsed.sessionId === "string"
      ? parsed.sessionId
      : parsed.session?.sessionId;
    return typeof sessionId === "string" && sessionId.length > 0
      ? { sessionId, streamIndex: 0 }
      : undefined;
  } catch {
    return undefined;
  }
}
