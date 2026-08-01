import { describe, expect, it } from "vitest";
import { createEveStreamResponse, decodeEveStream, type EveAgentEvent } from "@evetools/agent";

async function collect(response: Response): Promise<EveAgentEvent[]> {
  if (!response.body) throw new Error("Response has no body.");
  const events: EveAgentEvent[] = [];
  for await (const event of decodeEveStream(response.body)) events.push(event);
  return events;
}

describe("Eve stream lifecycle protocol", () => {
  it("frames a successful stream with running and completed events", async () => {
    async function* source() {
      yield { type: "text-delta", text: "Done" };
    }

    const events = await collect(createEveStreamResponse(source(), { turnId: "turn-1" }));
    expect(events.map((event) => event.type)).toEqual(["lifecycle", "text", "lifecycle"]);
    expect(events[0]).toMatchObject({ type: "lifecycle", turnId: "turn-1", status: "running" });
    expect(events[2]).toMatchObject({ type: "lifecycle", turnId: "turn-1", status: "completed" });
  });

  it("emits a failed completion when the source throws", async () => {
    async function* source(): AsyncGenerator<unknown> {
      throw new Error("model failed");
    }

    const events = await collect(createEveStreamResponse(source(), { turnId: "turn-2" }));
    expect(events).toContainEqual({ type: "error", message: "The Eve agent stream failed." });
    expect(events.at(-1)).toMatchObject({ type: "lifecycle", turnId: "turn-2", status: "failed" });
  });
});
