import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireRequestSlot: vi.fn<
    (request: Request) =>
      | { allowed: true; release: () => void }
      | { allowed: false; retryAfter: number }
  >(),
  authorizeOwner: vi.fn<() => Promise<Response | null>>(),
  hasAllowedOrigin: vi.fn<(request: Request) => boolean>(),
  hasOpenRouterApiKey: vi.fn<() => boolean>(),
  openRouterModel: vi.fn<(modelId: string) => unknown>(),
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

vi.mock("@evetools/openrouter/server", () => ({
  hasOpenRouterApiKey: mocks.hasOpenRouterApiKey,
  openRouterModel: mocks.openRouterModel,
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
      messages: [{ role: "user", content: "hello" }],
      model: "openai/gpt-5.6-luna",
      ...body,
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorizeOwner.mockResolvedValue(null);
  mocks.hasAllowedOrigin.mockReturnValue(true);
  mocks.hasOpenRouterApiKey.mockReturnValue(true);
  mocks.openRouterModel.mockReturnValue({ id: "model" });
  mocks.acquireRequestSlot.mockReturnValue({
    allowed: true,
    release: mocks.release,
  });
  mocks.streamText.mockReturnValue({
    fullStream: eventStream({ type: "text-delta", text: "hello" }),
  });
});

describe("Chat OpenRouter route", () => {
  it("returns the owner authorization response before model work", async () => {
    mocks.authorizeOwner.mockResolvedValue(
      Response.json({ error: "Authentication required." }, { status: 401 }),
    );

    const response = await POST(request({}));

    expect(response.status).toBe(401);
    expect(mocks.hasOpenRouterApiKey).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("rejects models outside the curated catalog", async () => {
    const response = await POST(request({ model: "openai/not-curated" }));

    expect(response.status).toBe(400);
    expect(mocks.hasOpenRouterApiKey).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("rejects image attachments for a text-only model", async () => {
    const response = await POST(
      request({
        model: "~deepseek/deepseek-v4-flash-latest",
        messages: [
          {
            role: "user",
            content: "inspect this",
            attachments: [
              {
                name: "image.png",
                mediaType: "image/png",
                data: "data:image/png;base64,AAAA",
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

  it("reports a missing OpenRouter key before rate limiting", async () => {
    mocks.hasOpenRouterApiKey.mockReturnValue(false);

    const response = await POST(request({}));

    expect(response.status).toBe(503);
    expect(mocks.acquireRequestSlot).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("rate limits before constructing the upstream stream", async () => {
    mocks.acquireRequestSlot.mockReturnValue({
      allowed: false,
      retryAfter: 17,
    });

    const response = await POST(request({}));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(mocks.openRouterModel).not.toHaveBeenCalled();
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("adapts OpenRouter text and reasoning events and releases its slot", async () => {
    mocks.streamText.mockReturnValue({
      fullStream: eventStream(
        { type: "reasoning-delta", text: "thinking" },
        { type: "text-delta", text: "hello" },
      ),
    });

    const response = await POST(request({}));
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as unknown);

    expect(response.status).toBe(200);
    expect(events).toEqual([
      { type: "reasoning", delta: "thinking" },
      { type: "text", delta: "hello" },
    ]);
    expect(mocks.openRouterModel).toHaveBeenCalledWith("openai/gpt-5.6-luna");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
