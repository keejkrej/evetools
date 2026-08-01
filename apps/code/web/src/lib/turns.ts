import { createEveStreamResponse, decodeEveStream, type EveAgentEvent } from "@evetools/agent";

export type SequencedEveEvent = EveAgentEvent & { sequence: number };
type Subscriber = { send: (event: SequencedEveEvent) => void; close: () => void };
type TurnRecord = {
  id: string;
  threadId: string;
  controller: AbortController;
  events: SequencedEveEvent[];
  subscribers: Set<Subscriber>;
  state: "running" | "finished";
  cleanup?: ReturnType<typeof setTimeout>;
};

const turns = new Map<string, TurnRecord>();
const RETENTION_MS = 10 * 60_000;
const MAX_BUFFERED_EVENTS = 10_000;

function finish(turn: TurnRecord) {
  if (turn.state === "finished") return;
  turn.state = "finished";
  for (const subscriber of turn.subscribers) subscriber.close();
  turn.subscribers.clear();
  turn.cleanup = setTimeout(() => turns.delete(turn.id), RETENTION_MS);
  turn.cleanup.unref?.();
}

function publish(turn: TurnRecord, event: EveAgentEvent) {
  const sequenced = { ...event, sequence: (turn.events.at(-1)?.sequence ?? 0) + 1 } as SequencedEveEvent;
  turn.events.push(sequenced);
  if (turn.events.length > MAX_BUFFERED_EVENTS) turn.events.shift();
  for (const subscriber of turn.subscribers) subscriber.send(sequenced);
}

export function prepareTurn(id: string, threadId: string) {
  if (turns.has(id)) throw new Error("Turn already exists.");
  const turn: TurnRecord = {
    id,
    threadId,
    controller: new AbortController(),
    events: [],
    subscribers: new Set(),
    state: "running",
  };
  turns.set(id, turn);

  return {
    signal: turn.controller.signal,
    start(source: AsyncIterable<unknown>) {
      void (async () => {
        const response = createEveStreamResponse(source, { signal: turn.controller.signal, turnId: id });
        if (!response.body) throw new Error("Turn stream did not provide a body.");
        try {
          for await (const event of decodeEveStream(response.body)) publish(turn, event);
        } finally {
          finish(turn);
        }
      })().catch(() => {
        publish(turn, { type: "error", message: "The server-owned turn failed." });
        finish(turn);
      });
    },
  };
}

export function isTurnRunning(id: string): boolean {
  return turns.get(id)?.state === "running";
}

export function stopTurn(id: string): boolean {
  const turn = turns.get(id);
  if (!turn || turn.state !== "running") return false;
  turn.controller.abort();
  return true;
}

export function subscribeToTurn(id: string, after = 0): Response | null {
  const turn = turns.get(id);
  if (!turn) return null;
  const encoder = new TextEncoder();
  let subscriber: Subscriber | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: SequencedEveEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      for (const event of turn.events) if (event.sequence > after) send(event);
      if (turn.state === "finished") {
        controller.close();
        return;
      }
      subscriber = { send, close: () => controller.close() };
      turn.subscribers.add(subscriber);
    },
    cancel() {
      if (subscriber) turn.subscribers.delete(subscriber);
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
