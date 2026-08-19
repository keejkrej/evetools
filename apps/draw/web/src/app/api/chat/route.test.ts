import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireRequestSlot: vi.fn<
    (request: Request) =>
      | { allowed: true; release: () => void }
      | { allowed: false; retryAfter: number }
  >(),
  authorizeOwner: vi.fn<() => Promise<Response | null>>(),
  hasAllowedOrigin: vi.fn<(request: Request) => boolean>(),
  hasOpenAiConfig: vi.fn<() => boolean>(),
  openAiModel: vi.fn<(modelId: string) => unknown>(),
  createPenpotDrawingClientFromEnv: vi.fn(),
  inspectDrawing: vi.fn(),
  applyDrawing: vi.fn(),
  exportDrawing: vi.fn(),
  closeDrawingClient: vi.fn(),
  release: vi.fn(),
  streamText: vi.fn<
    (options: Record<string, unknown>) => { fullStream: AsyncIterable<unknown> }
  >(),
}));

vi.mock("@/lib/owner-auth", () => ({
  authorizeOwner: mocks.authorizeOwner,
}));

vi.mock("@/lib/request-guard", () => ({
  acquireRequestSlot: mocks.acquireRequestSlot,
  hasAllowedOrigin: mocks.hasAllowedOrigin,
}));

vi.mock("@evetools/models/server", () => ({
  hasOpenAiConfig: mocks.hasOpenAiConfig,
  openAiModel: mocks.openAiModel,
}));

vi.mock("@/lib/penpot-drawing-client", () => ({
  createPenpotDrawingClientFromEnv: mocks.createPenpotDrawingClientFromEnv,
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: mocks.streamText,
}));

import { POST } from "./route";

async function* eventStream(...events: unknown[]) {
  for (const event of events) yield event;
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "draw a box" }],
      model: "chatgpt/gpt-5.6-luna",
      ...body,
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorizeOwner.mockResolvedValue(null);
  mocks.hasAllowedOrigin.mockReturnValue(true);
  mocks.hasOpenAiConfig.mockReturnValue(true);
  mocks.openAiModel.mockReturnValue({ id: "model" });
  mocks.acquireRequestSlot.mockReturnValue({
    allowed: true,
    release: mocks.release,
  });
  mocks.createPenpotDrawingClientFromEnv.mockReturnValue({
    inspect: mocks.inspectDrawing,
    apply: mocks.applyDrawing,
    export: mocks.exportDrawing,
    close: mocks.closeDrawingClient,
  });
  mocks.closeDrawingClient.mockResolvedValue(undefined);
  mocks.streamText.mockReturnValue({
    fullStream: eventStream({ type: "text-delta", text: "done" }),
  });
});

describe("Draw gateway route", () => {
  it("returns the owner authorization response before model work", async () => {
    mocks.authorizeOwner.mockResolvedValue(
      Response.json({ error: "Access denied." }, { status: 403 }),
    );

    const response = await POST(request({}));

    expect(response.status).toBe(403);
    expect(mocks.hasOpenAiConfig).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("rejects models outside the curated catalog", async () => {
    const response = await POST(request({ model: "openai/not-curated" }));

    expect(response.status).toBe(400);
    expect(mocks.hasOpenAiConfig).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("rejects image attachments for a text-only model", async () => {
    const response = await POST(
      request({
        model: "grok/grok-code",
        messages: [
          {
            role: "user",
            content: "draw from this",
            attachments: [
              {
                name: "image.webp",
                mediaType: "image/webp",
                data: "data:image/webp;base64,AAAA",
              },
            ],
          },
        ],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("does not support image"),
    });
    expect(mocks.acquireRequestSlot).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("reports a missing key before acquiring a request slot", async () => {
    mocks.hasOpenAiConfig.mockReturnValue(false);

    const response = await POST(request({}));

    expect(response.status).toBe(503);
    expect(mocks.acquireRequestSlot).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("rate limits before constructing the upstream stream", async () => {
    mocks.acquireRequestSlot.mockReturnValue({
      allowed: false,
      retryAfter: 23,
    });

    const response = await POST(request({}));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("23");
    expect(mocks.openAiModel).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("preserves Penpot tool events and releases its slot", async () => {
    mocks.streamText.mockReturnValue({
      fullStream: eventStream(
        {
          type: "tool-call",
          toolCallId: "draw-1",
          toolName: "apply_drawing_patch",
          title: "Draw",
          input: {
            baseRevision: "opaque:1",
            idempotencyKey: "draw-1",
            operations: [],
          },
        },
        {
          type: "tool-result",
          toolCallId: "draw-1",
          toolName: "apply_drawing_patch",
          title: "Draw",
        },
        { type: "text-delta", text: "done" },
      ),
    });

    const response = await POST(request({}));
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as unknown);

    expect(response.status).toBe(200);
    expect(events).toEqual([
      {
        type: "tool",
        id: "draw-1",
        name: "apply_drawing_patch",
        title: "Draw",
        status: "running",
        input: {
          baseRevision: "opaque:1",
          idempotencyKey: "draw-1",
          operations: [],
        },
      },
      {
        type: "tool",
        id: "draw-1",
        name: "apply_drawing_patch",
        title: "Draw",
        status: "complete",
      },
      { type: "text", delta: "done" },
    ]);
    const options = mocks.streamText.mock.calls[0][0];
    expect(Object.keys(options.tools as object)).toEqual([
      "inspect_drawing",
      "apply_drawing_patch",
      "export_drawing",
    ]);
    expect(mocks.closeDrawingClient).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("returns real Penpot outcomes from the model-facing tool", async () => {
    const outcome = {
      protocolVersion: "eve.design/v1",
      status: "ok",
      data: {
        revision: "opaque:1",
        document: { fileId: "file-1" },
        page: { id: "page-1" },
        selectionIds: [],
        shapes: [],
        truncated: false,
      },
    };
    mocks.inspectDrawing.mockResolvedValue(outcome);

    const response = await POST(request({}));
    await response.text();
    const options = mocks.streamText.mock.calls[0][0];
    const inspectTool = (options.tools as Record<
      string,
      { execute: (input: Record<string, unknown>) => Promise<unknown> }
    >).inspect_drawing;

    await expect(inspectTool.execute({ scope: "current-page" })).resolves.toBe(
      outcome,
    );
    expect(mocks.inspectDrawing).toHaveBeenCalledWith(
      { scope: "current-page" },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("continues as chat-only when Penpot is not configured", async () => {
    mocks.createPenpotDrawingClientFromEnv.mockReturnValue(null);

    const response = await POST(request({}));
    await response.text();
    const options = mocks.streamText.mock.calls[0][0];

    expect(options.tools).toBeUndefined();
    expect(options.system).toContain("not connected");
    expect(mocks.closeDrawingClient).not.toHaveBeenCalled();
  });

  it("streams exported archives to the browser without putting bytes in the model result", async () => {
    const archive = {
      protocolVersion: "eve.design/v1",
      status: "ok",
      data: {
        revision: "opaque:2",
        artifact: {
          format: "penpot",
          mimeType: "application/zip",
          fileName: "diagram.penpot",
          byteLength: 3,
          data: { encoding: "base64", data: "AQID" },
        },
      },
    };
    mocks.exportDrawing.mockResolvedValue(archive);
    let modelResult: unknown;
    mocks.streamText.mockImplementation((options) => ({
      fullStream: (async function* () {
        const exportTool = (options.tools as Record<
          string,
          {
            execute: (
              input: Record<string, unknown>,
              context: { toolCallId: string },
            ) => Promise<unknown>;
          }
        >).export_drawing;
        modelResult = await exportTool.execute({}, { toolCallId: "export-1" });
        yield {
          type: "tool-result",
          toolCallId: "export-1",
          toolName: "export_drawing",
        };
      })(),
    }));

    const response = await POST(request({ messages: [{ role: "user", content: "export it" }] }));
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as unknown);

    expect(modelResult).toMatchObject({
      receiptType: "evedraw.export-delivery/v1",
      status: "ok",
      data: {
        artifact: {
          fileName: "diagram.penpot",
          encoding: "base64",
          delivery: "browser-download",
        },
      },
    });
    expect(modelResult).not.toHaveProperty("protocolVersion");
    expect(JSON.stringify(modelResult)).not.toContain("AQID");
    expect(events).toEqual([
      {
        type: "tool",
        id: "export-1",
        name: "export_drawing",
        status: "complete",
      },
      {
        type: "artifact",
        id: "export-1",
        fileName: "diagram.penpot",
        mediaType: "application/zip",
        encoding: "base64",
        data: "AQID",
      },
    ]);
  });

  it("does not render domain error outcomes as successful tool activity", async () => {
    mocks.streamText.mockReturnValue({
      fullStream: eventStream({
        type: "tool-result",
        toolCallId: "apply-1",
        toolName: "apply_drawing_patch",
        output: {
          protocolVersion: "eve.design/v1",
          status: "error",
          faults: [
            {
              code: "revision_conflict",
              message: "Inspect again.",
              retryable: true,
            },
          ],
        },
      }),
    });

    const response = await POST(request({}));

    await expect(response.text()).resolves.toContain('"status":"error"');
  });
});
