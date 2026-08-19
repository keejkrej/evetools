import { streamText, type ModelMessage } from "ai";
import {
  CHAT_MODEL,
  isCuratedModel,
  modelSupportsImages,
} from "@evetools/models";
import {
  hasOpenAiConfig,
  openAiModel,
} from "@evetools/models/server";
import { authorizeOwner } from "@/lib/owner-auth";
import { z } from "zod";
import {
  acquireRequestSlot,
  hasAllowedOrigin,
} from "@/lib/request-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
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
    .regex(/^~?[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:/-]+$/)
    .refine(isCuratedModel)
    .default(CHAT_MODEL),
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
  if (!hasOpenAiConfig()) {
    return Response.json(
      { error: "OPENAI_BASE_URL and OPENAI_API_KEY are required." },
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
  if (
    attachmentBytes > 0 &&
    !modelSupportsImages(parsed.data.model)
  ) {
    return Response.json(
      { error: "The selected model does not support image attachments." },
      { status: 400 },
    );
  }

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

  let result: ReturnType<typeof streamText>;
  try {
    result = streamText({
      model: openAiModel(parsed.data.model),
      system:
        "You are Eve, a thoughtful and accurate general-purpose assistant. Answer directly and use Markdown when useful. Never claim to have done something you did not do.",
      messages,
      abortSignal: request.signal,
    });
  } catch {
    slot.release();
    return Response.json(
      { error: "The model stream could not be started." },
      { status: 500 },
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
            send({ type: "text", delta: part.text });
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
