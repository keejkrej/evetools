import { stepCountIs, streamText, tool, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { cursor } from "ai-sdk-provider-cursor-sdk";
import { authorizeOwner } from "@/lib/owner-auth";
import { z } from "zod";
import { drawOnBoardInputSchema } from "@/lib/board-schema";
import {
  acquireRequestSlot,
  hasAllowedOrigin,
} from "@/lib/request-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

const OLLAMA_REASONING_MARKER = "[[eve:ollama-reasoning]]";

/**
 * Ollama's OpenAI-compatible chat endpoint emits thinking in `delta.reasoning`
 * (and older model runners use `reasoning_content` or `thinking`). The OpenAI
 * AI SDK adapter intentionally only maps the standard `content` field, so
 * expose those deltas as marked text for the route's event adapter below.
 */
async function ollamaReasoningFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const response = await fetch(input, init);
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    return response;
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered = "";
  const rewriteLine = (line: string) => {
    if (!line.startsWith("data:")) return `${line}\n`;
    try {
      const event = JSON.parse(line.slice(5).trim()) as {
        choices?: Array<{
          delta?: {
            reasoning?: string;
            reasoning_content?: string;
            thinking?: string;
          };
        }>;
      };
      const reasoning = event.choices
        ?.map(
          (choice) =>
            choice.delta?.reasoning ??
            choice.delta?.reasoning_content ??
            choice.delta?.thinking,
        )
        .filter((value): value is string => Boolean(value))
        .join("");
      return reasoning
        ? `data: ${JSON.stringify({
            ...event,
            choices: [{ delta: { content: `${OLLAMA_REASONING_MARKER}${reasoning}` }, index: 0 }],
          })}\n\n${line}\n`
        : `${line}\n`;
    } catch {
      return `${line}\n`;
    }
  };
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffered += decoder.decode(chunk, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) controller.enqueue(encoder.encode(rewriteLine(line.replace(/\r$/, ""))));
    },
    flush(controller) {
      buffered += decoder.decode();
      if (buffered) controller.enqueue(encoder.encode(rewriteLine(buffered.replace(/\r$/, ""))));
    },
  });
  return new Response(response.body.pipeThrough(stream), response);
}

const ollama = createOpenAI({
  apiKey: process.env.OLLAMA_API_KEY,
  baseURL: "https://ollama.com/v1",
  fetch: ollamaReasoningFetch,
});

const requestSchema = z.object({
  provider: z.enum(["cursor", "ollama"]).default("cursor"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(100_000),
        attachments: z
          .array(
            z.object({
              name: z.string().min(1).max(255),
              mediaType: z
                .string()
                .regex(/^image\/(png|jpeg|webp|gif)$/),
              data: z
                .string()
                .max(3_800_000)
                .regex(
                  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/,
                ),
            }),
          )
          .max(3)
          .optional(),
      }),
    )
    .min(1)
    .max(100),
  model: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._:/-]+$/)
    .default("auto"),
});

export async function POST(request: Request) {
  const unauthorized = await authorizeOwner();
  if (unauthorized) return unauthorized;

  if (!hasAllowedOrigin(request)) {
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid chat request." }, { status: 400 });
  }
  if (
    (parsed.data.provider === "cursor" && !process.env.CURSOR_API_KEY) ||
    (parsed.data.provider === "ollama" && !process.env.OLLAMA_API_KEY)
  ) {
    return Response.json(
      {
        error:
          parsed.data.provider === "ollama"
            ? "OLLAMA_API_KEY is not configured."
            : "CURSOR_API_KEY is not configured.",
      },
      { status: 503 },
    );
  }
  const attachmentBytes = parsed.data.messages.reduce(
    (total, message) =>
      total +
      (message.attachments?.reduce(
        (messageTotal, attachment) => messageTotal + attachment.data.length,
        0,
      ) ?? 0),
    0,
  );
  if (attachmentBytes > 3_800_000) {
    return Response.json(
      { error: "Image attachments are too large." },
      { status: 413 },
    );
  }

  const messages: ModelMessage[] = parsed.data.messages.map((message) => {
    if (message.role === "assistant" || !message.attachments?.length) {
      return { role: message.role, content: message.content };
    }
    return {
      role: "user",
      content: [
        { type: "text", text: message.content },
        ...message.attachments.map((attachment) => ({
          type: "file" as const,
          mediaType: attachment.mediaType,
          filename: attachment.name,
          data: { type: "data" as const, data: attachment.data },
        })),
      ],
    };
  });

  const result = streamText({
    model:
      parsed.data.provider === "ollama"
        ? ollama.chat(parsed.data.model)
        : cursor(parsed.data.model, {
            createNewAgentPerCall: true,
            mode: "plan",
            promptHistoryMode: "flatten",
            systemMessageMode: "prefix",
            cloud: {
              env: { type: "cloud" },
              repos: [],
              autoCreatePR: false,
              skipReviewerRequest: true,
            },
          }),
    system:
      "You are Eve, a thoughtful and accurate general-purpose assistant with an Excalidraw canvas. Answer directly and use Markdown when useful. When a user asks you to draw, diagram, sketch, map, or wireframe something, use draw_on_board. Use stable unique ids, bind arrows with start/end ids, keep layouts readable with at least 48px gaps, and briefly summarize what you placed after the tool succeeds. Never claim to have done something you did not do.",
    messages,
    tools: {
      draw_on_board: tool({
        description: "Draw or update shapes on the user's Excalidraw canvas. Prefer replace for a complete new diagram and append for additions.",
        inputSchema: drawOnBoardInputSchema,
        execute: async ({ mode, elements }) => ({ status: "applied_by_client", mode, elementCount: elements.length }),
      }),
      suggest_board_layout: tool({
        description: "Develop a concise layout plan before drawing a complex flowchart, architecture, sequence, mind map, or wireframe.",
        inputSchema: z.object({ goal: z.string().min(1), style: z.enum(["flowchart", "architecture", "sequence", "mindmap", "wireframe"]) }),
        execute: async ({ goal, style }) => ({ goal, style, guidance: "Keep labels short, align related nodes, leave at least 48px between shapes, and label important connectors." }),
      }),
    },
    stopWhen: stepCountIs(5),
    providerOptions:
      parsed.data.provider === "ollama"
        ? { openai: { forceReasoning: true, reasoningEffort: "medium" } }
        : undefined,
    abortSignal: request.signal,
  });

  const slot = acquireRequestSlot(request);
  if (!slot.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(slot.retryAfter) },
      },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            if (part.text.startsWith(OLLAMA_REASONING_MARKER)) {
              send({
                type: "reasoning",
                delta: part.text.slice(OLLAMA_REASONING_MARKER.length),
              });
            } else {
              send({ type: "text", delta: part.text });
            }
          } else if (part.type === "reasoning-delta") {
            send({ type: "reasoning", delta: part.text });
          } else if (
            part.type === "tool-input-start" ||
            part.type === "tool-call"
          ) {
            send({
              type: "tool",
              id: part.type === "tool-input-start" ? part.id : part.toolCallId,
              name: part.toolName,
              title: part.title,
              status: "running",
              input: part.type === "tool-call" ? part.input : undefined,
            });
          } else if (part.type === "tool-result") {
            send({
              type: "tool",
              id: part.toolCallId,
              name: part.toolName,
              title: part.title,
              status: "complete",
            });
          } else if (part.type === "tool-error") {
            send({
              type: "tool",
              id: part.toolCallId,
              name: part.toolName,
              title: part.title,
              status: "error",
            });
          } else if (part.type === "error") {
            send({ type: "error", message: "The model stream failed." });
          }
        }
      } catch {
        if (!request.signal.aborted) {
          send({ type: "error", message: "The model stream failed." });
        }
      } finally {
        slot.release();
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
