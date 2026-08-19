import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "./catalog";
import { listModels } from "./server";

const originalApiKey = process.env.OPENAI_API_KEY;
const originalBaseUrl = process.env.OPENAI_BASE_URL;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
  if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = originalBaseUrl;
  vi.unstubAllGlobals();
});

describe("OpenAI-compatible server boundary", () => {
  it("uses the curated catalog without a configured gateway", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;

    await expect(listModels()).resolves.toEqual({
      models: [...MODELS],
      source: "fallback",
    });
  });

  it("filters live metadata without changing curated order", async () => {
    process.env.OPENAI_API_KEY = "sk-sub-test";
    process.env.OPENAI_BASE_URL = "https://subproxy.example/v1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://subproxy.example/v1/models");
        return Response.json({
          data: [
            { id: "grok/grok-code" },
            { id: "chatgpt/gpt-5.6-luna" },
            { id: "ignored/other" },
          ],
        });
      }),
    );

    const result = await listModels();

    expect(result.source).toBe("live");
    expect(result.models.map((model) => model.id)).toEqual([
      "chatgpt/gpt-5.6-luna",
      "grok/grok-code",
    ]);
    expect(result.models[0]).toMatchObject({ displayName: "GPT-5.6 Luna" });
  });
});
