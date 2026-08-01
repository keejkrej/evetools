export type EveAgentStatus = "idle" | "running" | "stopped" | "failed";
export type EveTurnStatus = "running" | "completed" | "stopped" | "failed";

export type EveToolEvent = {
  type: "tool";
  id: string;
  name: string;
  title?: string;
  status: "running" | "complete" | "error";
  input?: unknown;
};

export type EveAgentEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | EveToolEvent
  | { type: "lifecycle"; turnId: string; status: EveTurnStatus; at: number }
  | { type: "error"; message: string };

export async function* decodeEveStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<EveAgentEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line) as EveAgentEvent;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield JSON.parse(buffer) as EveAgentEvent;
  } finally {
    reader.releaseLock();
  }
}

export function createEveStreamResponse(
  source: AsyncIterable<unknown>,
  options: { signal?: AbortSignal; turnId?: string; onFinally?: () => void } = {},
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: EveAgentEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      let failed = false;
      if (options.turnId) send({ type: "lifecycle", turnId: options.turnId, status: "running", at: Date.now() });

      try {
        for await (const part of source) {
          if (options.signal?.aborted) break;
          const item = part as Record<string, unknown>;
          if (item.type === "text-delta") {
            send({ type: "text", delta: String(item.text ?? "") });
          } else if (item.type === "reasoning-delta") {
            send({ type: "reasoning", delta: String(item.text ?? "") });
          } else if (item.type === "tool-input-start" || item.type === "tool-call") {
            send({
              type: "tool",
              id: String(item.type === "tool-input-start" ? item.id : item.toolCallId),
              name: String(item.toolName),
              title: typeof item.title === "string" ? item.title : undefined,
              status: "running",
              input: item.type === "tool-call" ? item.input : undefined,
            });
          } else if (item.type === "tool-result" || item.type === "tool-error") {
            send({
              type: "tool",
              id: String(item.toolCallId),
              name: String(item.toolName),
              title: typeof item.title === "string" ? item.title : undefined,
              status: item.type === "tool-result" ? "complete" : "error",
            });
          } else if (item.type === "error") {
            failed = true;
            send({ type: "error", message: "The Eve agent stream failed." });
          }
        }
      } catch {
        failed = true;
        if (!options.signal?.aborted) send({ type: "error", message: "The Eve agent stream failed." });
      } finally {
        if (options.turnId) {
          const status = options.signal?.aborted ? "stopped" : failed ? "failed" : "completed";
          send({ type: "lifecycle", turnId: options.turnId, status, at: Date.now() });
        }
        options.onFinally?.();
        controller.close();
      }
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
