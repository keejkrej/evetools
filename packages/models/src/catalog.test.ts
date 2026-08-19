import { describe, expect, it } from "vitest";
import {
  CHAT_MODEL,
  CODE_MODEL,
  isCuratedModel,
  MODELS,
  modelSupportsImages,
} from "./catalog";

describe("model catalog", () => {
  it("keeps the curated cross-product order and surface defaults", () => {
    expect(MODELS.map((model) => model.id)).toEqual([
      "chatgpt/gpt-5.6-luna",
      "chatgpt/gpt-5.6-terra",
      "chatgpt/gpt-5.6-sol",
      "chatgpt/gpt-5.6",
      "chatgpt/gpt-5.5",
      "grok/grok-4.6",
      "grok/grok-4.5",
      "grok/grok-4",
      "grok/grok-code",
      "cursor/composer-2.5",
      "cursor/composer-2",
      "cursor/auto",
    ]);
    expect(MODELS.some(({ id }) => id === CHAT_MODEL)).toBe(true);
    expect(MODELS.some(({ id }) => id === CODE_MODEL)).toBe(true);
    expect(isCuratedModel("chatgpt/gpt-5.6-luna")).toBe(true);
    expect(isCuratedModel("openai/gpt-5.6-luna")).toBe(false);
    expect(modelSupportsImages("chatgpt/gpt-5.6-luna")).toBe(true);
    expect(modelSupportsImages(CODE_MODEL)).toBe(false);
    expect(modelSupportsImages("cursor/composer-2.5")).toBe(false);
  });
});
