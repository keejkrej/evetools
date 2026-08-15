import { afterEach, describe, expect, it, vi } from "vitest";
import { OPENROUTER_MODELS } from "./catalog";
import { listOpenRouterModels } from "./server";

const originalApiKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalApiKey;
  vi.unstubAllGlobals();
});

describe("OpenRouter server boundary", () => {
  it("uses the curated catalog without a configured key", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(listOpenRouterModels()).resolves.toEqual({
      models: [...OPENROUTER_MODELS],
      source: "fallback",
    });
  });

  it("filters and augments live metadata without changing curated order", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              id: "z-ai/glm-5.2",
              name: "Live GLM",
              description: `Live ${"description ".repeat(40)}`,
              supported_parameters: ["tools"],
            },
            {
              id: "openai/gpt-5.6-luna",
              name: "Live Luna",
              description: "Live Luna description",
              supported_parameters: ["tools"],
            },
            {
              id: "deepseek/deepseek-v4-flash-latest",
              name: "Live DeepSeek",
              description: "Live DeepSeek description",
              supported_parameters: ["tools"],
            },
          ],
        }),
      ),
    );

    const result = await listOpenRouterModels({ requireTools: true });

    expect(result.source).toBe("openrouter");
    expect(result.models.map((model) => model.id)).toEqual([
      "openai/gpt-5.6-luna",
      "~deepseek/deepseek-v4-flash-latest",
      "z-ai/glm-5.2",
    ]);
    expect(result.models[0]).toMatchObject({ displayName: "Live Luna" });
    expect(result.models[2].description.length).toBeLessThanOrEqual(240);
  });
});
