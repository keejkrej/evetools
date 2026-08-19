import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_OPENROUTER_MODEL,
  migrateOpenRouterModel,
  normalizeOpenRouterModel,
  OPENROUTER_MODELS,
} from "../bin/openrouter-models.mjs";
import {
  resolveOpenRouterModel,
  resolveOpenRouterModelId,
} from "../src/models/providers.js";
import { OPENROUTER_MODELS as SHARED_OPENROUTER_MODELS } from "../../../../packages/openrouter/src/catalog.js";

test("OpenRouter is the sole TUI model transport", () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  try {
    const selection = resolveOpenRouterModel("xiaomi/mimo-v2.5");
    const model = selection.model as unknown as {
      specificationVersion: string;
      provider: string;
      modelId: string;
    };
    assert.equal(model.specificationVersion, "v4");
    assert.match(model.provider, /^openrouter(?:\.|$)/);
    assert.equal(model.modelId, "xiaomi/mimo-v2.5");
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("the shared agent core resolves a curated web model from Eve client context", () => {
  const messages = [
    { role: "user" as const, content: "Earlier prompt" },
    {
      role: "user" as const,
      content: 'Client context:\n{"evecode":{"model":"openai/gpt-5.6-luna"}}',
    },
    { role: "user" as const, content: "Please inspect the repository." },
  ];

  assert.equal(
    resolveOpenRouterModelId(messages, "xiaomi/mimo-v2.5"),
    "openai/gpt-5.6-luna",
  );
});

test("the shared agent core falls back to TUI settings and rejects uncurated UI models", () => {
  assert.equal(resolveOpenRouterModelId([], "xiaomi/mimo-v2.5"), "xiaomi/mimo-v2.5");
  assert.throws(
    () => resolveOpenRouterModelId([{
      role: "user",
      content: 'Client context:\n{"evecode":{"model":"anthropic/not-curated"}}',
    }], undefined),
    /curated catalog/,
  );
});

test("the curated OpenRouter model order and legacy normalization stay stable", () => {
  assert.equal(DEFAULT_OPENROUTER_MODEL, "~deepseek/deepseek-v4-flash-latest");
  assert.deepEqual(OPENROUTER_MODELS, [
    "openai/gpt-5.6-luna",
    "xiaomi/mimo-v2.5",
    "~deepseek/deepseek-v4-flash-latest",
    "z-ai/glm-5.2",
    "minimax/minimax-m3",
    "moonshotai/kimi-k3",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
  ]);
  assert.equal(normalizeOpenRouterModel(undefined), DEFAULT_OPENROUTER_MODEL);
  assert.equal(normalizeOpenRouterModel("gateway"), DEFAULT_OPENROUTER_MODEL);
  assert.equal(normalizeOpenRouterModel("chatgpt/gpt-5.6-luna"), "openai/gpt-5.6-luna");
  assert.equal(migrateOpenRouterModel("chatgpt/legacy-model"), DEFAULT_OPENROUTER_MODEL);
  assert.equal(migrateOpenRouterModel("xai/legacy-model"), DEFAULT_OPENROUTER_MODEL);
  assert.equal(normalizeOpenRouterModel("ollama-cloud/legacy-model"), DEFAULT_OPENROUTER_MODEL);
  assert.throws(() => normalizeOpenRouterModel("not-a-model-id"), /provider\/model-id/);
  assert.throws(() => normalizeOpenRouterModel("anthropic/not-curated"), /curated catalog/);
  assert.deepEqual(
    OPENROUTER_MODELS,
    SHARED_OPENROUTER_MODELS.map(({ id }) => id),
    "the standalone TUI catalog must stay in parity with @evetools/openrouter",
  );
});

test("obsolete subscription OAuth transports and dependencies are absent", async () => {
  const [manifest, providers] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("src/models/providers.ts", "utf8"),
  ]);
  for (const contents of [manifest, providers]) {
    assert.doesNotMatch(
      contents,
      /@ai-sdk\/openai"|@earendil-works\/pi-coding-agent|prime-agent-eve|chatgpt\.com|api\.x\.ai|ollama\.com|AI_GATEWAY_API_KEY/,
    );
  }
  await assert.rejects(access("src/models/oauth"));
  assert.doesNotMatch(providers, /\.zshrc|EVE_AGENT_OAUTH|EVECODE_TUI_OAUTH/);
  assert.match(providers, /process\.env\.OPENROUTER_API_KEY/);
});
