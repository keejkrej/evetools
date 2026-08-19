import { describe, expect, it } from "vitest";
import { parseSavedEveSession, savedEveSession } from "./eve-session";

describe("Eve session persistence", () => {
  it("persists only a replay-from-zero session cursor", () => {
    expect(savedEveSession({ sessionId: "session-1", streamIndex: 982 })).toEqual({
      sessionId: "session-1",
      streamIndex: 0,
    });
  });

  it("migrates the preview event-log shape without retaining its events", () => {
    expect(parseSavedEveSession(JSON.stringify({
      events: [{ type: "action.result", data: "a very large tool result" }],
      session: { sessionId: "session-legacy", streamIndex: 42 },
    }))).toEqual({ sessionId: "session-legacy", streamIndex: 0 });
  });

  it("ignores malformed or empty session values", () => {
    expect(parseSavedEveSession("not json")).toBeUndefined();
    expect(parseSavedEveSession(JSON.stringify({ sessionId: "" }))).toBeUndefined();
  });
});
