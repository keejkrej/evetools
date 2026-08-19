import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_MODEL,
  migrateModel,
  normalizeModel,
  MODELS,
} from "../bin/models.mjs";
import {
  resolveModel,
  resolveModelId,
} from "../src/models/providers.js";
import { MODELS as SHARED_MODELS } from "../../../../packages/models/src/catalog.js";

test("OpenAI-compatible gateway is the sole TUI model transport", () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousUrl = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = "sk-sub-test";
  process.env.OPENAI_BASE_URL = "https://subproxy.example/v1";
  try {
    const selection = resolveModel("chatgpt/gpt-5.6-luna");
    const model = selection.model as unknown as {
      specificationVersion: string;
      provider: string;
      modelId: string;
    };
    assert.equal(model.specificationVersion, "v4");
    assert.match(model.provider, /^openai(?:\.|$)/);
    assert.equal(model.modelId, "chatgpt/gpt-5.6-luna");
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousUrl;
  }
});

test("the shared agent core resolves a curated web model from Eve client context", () => {
  const messages = [
    { role: "user" as const, content: "Earlier prompt" },
    {
      role: "user" as const,
      content: 'Client context:\n{"evecode":{"model":"chatgpt/gpt-5.6-luna"}}',
    },
    { role: "user" as const, content: "Please inspect the repository." },
  ];

  assert.equal(
    resolveModelId(messages, "grok/grok-code"),
    "chatgpt/gpt-5.6-luna",
  );
});

test("the shared agent core falls back to TUI settings and rejects uncurated UI models", () => {
  assert.equal(resolveModelId([], "grok/grok-code"), "grok/grok-code");
  assert.throws(
    () => resolveModelId([{
      role: "user",
      content: 'Client context:\n{"evecode":{"model":"anthropic/not-curated"}}',
    }], undefined),
    /curated catalog/,
  );
});

test("the curated model order and legacy normalization stay stable", () => {
  assert.equal(DEFAULT_MODEL, "grok/grok-code");
  assert.deepEqual(MODELS, [
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
  assert.equal(normalizeModel(undefined), DEFAULT_MODEL);
  assert.equal(normalizeModel("gateway"), DEFAULT_MODEL);
  assert.equal(normalizeModel("openai/gpt-5.6-luna"), "chatgpt/gpt-5.6-luna");
  assert.equal(migrateModel("openai/legacy-model"), DEFAULT_MODEL);
  assert.equal(migrateModel("xai/legacy-model"), DEFAULT_MODEL);
  assert.equal(normalizeModel("ollama-cloud/legacy-model", { legacyFallback: true }), DEFAULT_MODEL);
  assert.throws(() => normalizeModel("not-a-model-id"), /provider\/model-id/);
  assert.throws(() => normalizeModel("anthropic/not-curated"), /curated catalog/);
  assert.deepEqual(
    MODELS,
    SHARED_MODELS.map(({ id }) => id),
    "the standalone TUI catalog must stay in parity with @evetools/models",
  );
});

test("obsolete subscription OAuth transports and OpenRouter adapters are absent", async () => {
  const [manifest, providers] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("src/models/providers.ts", "utf8"),
  ]);
  for (const contents of [manifest, providers]) {
    assert.doesNotMatch(
      contents,
      /@openrouter\/ai-sdk-provider|@earendil-works\/pi-coding-agent|prime-agent-eve|chatgpt\.com|api\.x\.ai|ollama\.com|AI_GATEWAY_API_KEY|OPENROUTER_API_KEY/,
    );
  }
  await assert.rejects(access("src/models/oauth"));
  await assert.rejects(access("bin/openrouter-models.mjs"));
  assert.doesNotMatch(providers, /\.zshrc|EVE_AGENT_OAUTH|EVECODE_TUI_OAUTH/);
  assert.match(providers, /process\.env\.OPENAI_API_KEY/);
  assert.match(providers, /process\.env\.OPENAI_BASE_URL/);
});
