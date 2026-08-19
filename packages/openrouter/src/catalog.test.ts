import { describe, expect, it } from "vitest";
import {
  CHAT_OPENROUTER_MODEL,
  CODE_OPENROUTER_MODEL,
  isCuratedOpenRouterModel,
  OPENROUTER_MODELS,
  openRouterModelSupportsImages,
} from "./catalog";

describe("OpenRouter model catalog", () => {
  it("keeps the curated cross-product order and surface defaults", () => {
    expect(OPENROUTER_MODELS.map((model) => model.id)).toEqual([
      "openai/gpt-5.6-luna",
      "xiaomi/mimo-v2.5",
      "~deepseek/deepseek-v4-flash-latest",
      "z-ai/glm-5.2",
      "minimax/minimax-m3",
      "moonshotai/kimi-k3",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
    ]);
    expect(OPENROUTER_MODELS.some(({ id }) => id === CHAT_OPENROUTER_MODEL)).toBe(true);
    expect(OPENROUTER_MODELS.some(({ id }) => id === CODE_OPENROUTER_MODEL)).toBe(true);
    expect(isCuratedOpenRouterModel("openai/gpt-5.6-luna")).toBe(true);
    expect(isCuratedOpenRouterModel("openai/not-curated")).toBe(false);
    expect(openRouterModelSupportsImages("minimax/minimax-m3")).toBe(true);
    expect(openRouterModelSupportsImages(CODE_OPENROUTER_MODEL)).toBe(false);
  });
});
