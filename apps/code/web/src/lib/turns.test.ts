import { decodeEveStream, type EveAgentEvent } from "@evetools/agent";
import { describe, expect, it } from "vitest";
import { prepareTurn, stopTurn, subscribeToTurn } from "./turns";

async function collect(response: Response): Promise<Array<EveAgentEvent & { sequence?: number }>> {
  if (!response.body) throw new Error("Missing stream body.");
  const events: Array<EveAgentEvent & { sequence?: number }> = [];
  for await (const event of decodeEveStream(response.body)) events.push(event);
  return events;
}

describe("server-owned turn registry", () => {
  it("buffers a detached turn and replays sequenced events", async () => {
    async function* source() {
      yield { type: "text-delta", text: "hello" };
    }
    const turn = prepareTurn("buffered-turn", "thread-a");
    turn.start(source());

    const response = subscribeToTurn("buffered-turn");
    expect(response).not.toBeNull();
    const events = await collect(response!);
    expect(events.map((event) => event.type)).toEqual(["lifecycle", "text", "lifecycle"]);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);

    const replay = await collect(subscribeToTurn("buffered-turn", 1)!);
    expect(replay.map((event) => event.sequence)).toEqual([2, 3]);
  });

  it("continues after a subscriber disconnects", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    async function* source() {
      await gate;
      yield { type: "text-delta", text: "after reconnect" };
    }
    const turn = prepareTurn("detached-turn", "thread-b");
    turn.start(source());
    const first = subscribeToTurn("detached-turn")!;
    const reader = first.body!.getReader();
    await reader.read();
    await reader.cancel();

    release();
    const replay = await collect(subscribeToTurn("detached-turn", 1)!);
    expect(replay).toContainEqual(expect.objectContaining({ type: "text", delta: "after reconnect" }));
    expect(replay.at(-1)).toMatchObject({ type: "lifecycle", status: "completed" });
  });

  it("stops a turn independently of its subscribers", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    async function* source() {
      await gate;
      yield { type: "text-delta", text: "ignored" };
    }
    const turn = prepareTurn("stopped-turn", "thread-c");
    turn.start(source());
    const response = subscribeToTurn("stopped-turn")!;
    expect(stopTurn("stopped-turn")).toBe(true);
    release();
    const events = await collect(response);
    expect(events.at(-1)).toMatchObject({ type: "lifecycle", status: "stopped" });
  });
});
