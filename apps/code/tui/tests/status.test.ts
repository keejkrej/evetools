import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const managementCli = [
  path.resolve("node_modules", "tsx", "dist", "cli.mjs"),
  path.resolve("bin", "evecode-cli.ts"),
];

test("product status reports roots, model, key presence, and surfaces without exposing the key", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evecode-status-"));
  const dataRoot = path.join(root, "data");
  const workspace = path.join(root, "workspace");
  await Promise.all([dataRoot, workspace].map((directory) => mkdir(directory)));
  await writeFile(path.join(dataRoot, "config.json"), JSON.stringify({
    version: 1,
    model: "xiaomi/mimo-v2.5",
    reasoning: "high",
  }));
  const secret = "must-not-appear-in-status";
  const result = spawnSync(process.execPath, [...managementCli, "status"], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      ...process.env,
      EVECODE_DATA_ROOT: dataRoot,
      EVECODE_WORKSPACE_ROOT: workspace,
      OPENROUTER_API_KEY: secret,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`Data root: ${dataRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(result.stdout, /Default workspace:/);
  assert.match(result.stdout, /Selected OpenRouter model: xiaomi\/mimo-v2\.5/);
  assert.match(result.stdout, /OPENROUTER_API_KEY: configured/);
  assert.match(result.stdout, /TUI surface: available/);
  assert.match(result.stdout, /Web surface:/);
  assert.doesNotMatch(result.stdout, new RegExp(secret));
  assert.doesNotMatch(result.stdout, /CURSOR_API_KEY|ChatGPT|Ollama|Gateway/);
});

test("product status rejects the same unusable workspace as launch", () => {
  const missing = path.join(os.tmpdir(), `evecode-missing-${randomUUID()}`);
  const result = spawnSync(process.execPath, [...managementCli, "status"], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: {
      ...process.env,
      EVECODE_WORKSPACE_ROOT: missing,
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot use coding workspace/);
  assert.doesNotMatch(result.stdout, /Default workspace:/);
});

test("zero-argument management commands reject ignored arguments", () => {
  for (const args of [
    ["status", "junk"],
    ["models", "junk"],
    ["login", "junk"],
    ["logout", "junk"],
    ["auth", "nonsense"],
  ]) {
    const result = spawnSync(process.execPath, [...managementCli, ...args], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(result.status, 1, `${args.join(" ")} unexpectedly succeeded`);
    assert.ok(result.stderr.trim().length > 0);
  }
});
