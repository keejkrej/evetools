import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { DevelopmentTuiPrompter } from "eve/tui";
import { runEvecodeModelFlow } from "../bin/tui-model-flow.mjs";

test("TUI model flow persists a model and thinking level, then requests a reload", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "evecode-tui-"));
  const previousRoot = process.env.EVECODE_DATA_ROOT;
  process.env.EVECODE_DATA_ROOT = dataRoot;
  const answers: unknown[] = [
    "model",
    "chatgpt/gpt-5.6-luna",
    "reasoning",
    "xhigh",
    "done",
  ];
  const requests: Array<Record<string, unknown>> = [];
  const prompter = {
    select: async (request: Record<string, unknown>) => {
      requests.push(request);
      return answers.shift();
    },
  } as unknown as DevelopmentTuiPrompter;
  const originalFetch = globalThis.fetch;
  let ready = false;
  let reloaded: unknown;
  const symbol = Symbol.for("evecode/settings-changed");
  (globalThis as Record<PropertyKey, unknown>)[symbol] = async (settings: unknown) => {
    reloaded = settings;
    ready = true;
  };
  globalThis.fetch = async () => Response.json({
    agent: {
      model: ready
        ? { reasoning: "xhigh", routing: { kind: "dynamic" } }
        : { reasoning: "low", routing: { kind: "dynamic" } },
    },
  });
  try {
    const message = await runEvecodeModelFlow({
      appRoot: "/tmp/evecode-tui",
      argument: "",
      prompter,
      serverUrl: "http://127.0.0.1:2000",
    });
    assert.match(message, /chatgpt\/gpt-5\.6-luna@xhigh/);
    assert.ok(requests.every((request) => !("hint" in request)));
    const modelRequest = requests.find((request) => request.message === "Choose a model");
    assert.equal(modelRequest?.search, true);
    assert.deepEqual(
      (modelRequest?.options as Array<{ value: string }>).map(({ value }) => value),
      [
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
      ],
    );
    const expected = {
      version: 1,
      model: "chatgpt/gpt-5.6-luna",
      reasoning: "xhigh",
    };
    assert.deepEqual(JSON.parse(await readFile(path.join(dataRoot, "config.json"), "utf8")), expected);
    assert.deepEqual(reloaded, expected);
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as Record<PropertyKey, unknown>)[symbol];
    if (previousRoot === undefined) delete process.env.EVECODE_DATA_ROOT;
    else process.env.EVECODE_DATA_ROOT = previousRoot;
  }
});
