import { stepCountIs, streamText, tool, type ModelMessage } from "ai";
import {
  CHAT_MODEL,
  isCuratedModel,
  modelSupportsImages,
} from "@evetools/models";
import {
  hasOpenAiConfig,
  openAiModel,
} from "@evetools/models/server";
import { type ExportDrawingOutcome } from "@evetools/drawing";
import { authorizeOwner } from "@/lib/owner-auth";
import { z } from "zod";
import {
  DRAWING_TOOL_DESCRIPTIONS,
  applyDrawingPatchToolInputSchema,
  exportDrawingToolInputSchema,
  inspectDrawingToolInputSchema,
} from "@/lib/drawing-tools";
import { createPenpotDrawingClientFromEnv } from "@/lib/penpot-drawing-client";
import {
  acquireRequestSlot,
  hasAllowedOrigin,
} from "@/lib/request-guard";

export const runtime = "nodejs";
export const maxDuration = 300;

const PENPOT_SYSTEM_PROMPT = `You are Eve, a thoughtful and accurate general-purpose assistant connected to the user's current Penpot workspace. Answer directly and use Markdown when useful.

When the user asks you to draw, diagram, sketch, map, wireframe, or edit the document:
- Call inspect_drawing first and treat its revision as opaque.
- Apply changes with apply_drawing_patch using that exact baseRevision and a stable, unique idempotencyKey. Use clientId references for shapes created earlier in the same patch.
- Keep layouts readable, align related shapes, and leave at least 48 pixels between neighboring shapes.
- Check status and structured faults. After a revision conflict, inspect again before retrying. Never report a partial or failed patch as complete.
- Use export_drawing only when the user asks for the native Penpot file.

Briefly summarize successful edits. Never claim to have changed the drawing unless Penpot returned an ok or partial receipt that confirms those changes.`;

const NO_PENPOT_SYSTEM_PROMPT =
  "You are Eve, a thoughtful and accurate general-purpose assistant. Answer directly and use Markdown when useful. The Penpot drawing workspace is not connected for this request, so do not claim to inspect or edit it. If the user asks for a drawing change, explain that the Penpot MCP connection must be configured.";

function exportReceiptForModel(outcome: ExportDrawingOutcome) {
  if (outcome.status === "error") {
    return {
      receiptType: "evedraw.export-delivery/v1",
      status: outcome.status,
      faults: outcome.faults,
    };
  }
  const { data: encodedData, ...artifact } = outcome.data.artifact;
  return {
    receiptType: "evedraw.export-delivery/v1",
    status: outcome.status,
    data: {
      ...outcome.data,
      artifact: {
        ...artifact,
        encoding: encodedData.encoding,
        delivery: "browser-download",
      },
    },
    ...(outcome.status === "partial" ? { faults: outcome.faults } : {}),
  };
}

type ExportArtifact = Extract<ExportDrawingOutcome, { status: "ok" | "partial" }>[
  "data"
]["artifact"];

function toolResultActivityStatus(output: unknown): "complete" | "error" {
  if (!output || typeof output !== "object" || !("status" in output)) {
    return "complete";
  }
  const status = (output as { status?: unknown }).status;
  return status === "error" || status === "partial" ? "error" : "complete";
}

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

  let drawingClient;
  try {
    drawingClient = createPenpotDrawingClientFromEnv();
  } catch {
    slot.release();
    return Response.json(
      { error: "PENPOT_MCP_URL is invalid." },
      { status: 503 },
    );
  }

  const exportArtifacts = new Map<string, ExportArtifact>();

  const drawingTools = drawingClient
    ? {
        inspect_drawing: tool({
          description:
            DRAWING_TOOL_DESCRIPTIONS.inspect,
          inputSchema: inspectDrawingToolInputSchema,
          execute: (input) =>
            drawingClient.inspect(input, { signal: request.signal }),
        }),
        apply_drawing_patch: tool({
          description:
            DRAWING_TOOL_DESCRIPTIONS.apply,
          inputSchema: applyDrawingPatchToolInputSchema,
          execute: (input) =>
            drawingClient.apply(input, { signal: request.signal }),
        }),
        export_drawing: tool({
          description:
            `${DRAWING_TOOL_DESCRIPTIONS.export} The model receives artifact metadata; the bounded MCP tool retains the archive payload.`,
          inputSchema: exportDrawingToolInputSchema,
          execute: async (input, { toolCallId }) => {
            const outcome = await drawingClient.export(input, {
              signal: request.signal,
            });
            if (outcome.status !== "error") {
              exportArtifacts.set(toolCallId, outcome.data.artifact);
            }
            return exportReceiptForModel(outcome);
          },
        }),
      }
    : undefined;

  const startStream = () =>
    streamText({
      model: openAiModel(parsed.data.model),
      system: drawingClient ? PENPOT_SYSTEM_PROMPT : NO_PENPOT_SYSTEM_PROMPT,
      messages,
      tools: drawingTools,
      stopWhen: stepCountIs(8),
      abortSignal: request.signal,
    });
  let result: ReturnType<typeof startStream>;
  try {
    result = startStream();
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
              status: toolResultActivityStatus(part.output),
            });
            const artifact = exportArtifacts.get(part.toolCallId);
            if (artifact) {
              exportArtifacts.delete(part.toolCallId);
              send({
                type: "artifact",
                id: part.toolCallId,
                fileName: artifact.fileName,
                mediaType: artifact.mimeType,
                encoding: artifact.data.encoding,
                data: artifact.data.data,
              });
            }
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
        await drawingClient?.close().catch(() => undefined);
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
