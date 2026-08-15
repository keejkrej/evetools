import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createTuiOptions,
  keepChildWhenReady,
  runtimeMatchesSettings,
  scheduleAfterSettled,
  settingsEnvironment,
  settingsRequireBuild,
  stopChild,
} from "../bin/runtime.mjs";

test("package exposes Evecode with a transitional alias and the forked public TUI", async () => {
  const [launcher, runtime, manifest] = await Promise.all([
    readFile("bin/evecode.mjs", "utf8"),
    readFile("bin/runtime.mjs", "utf8"),
    readFile("package.json", "utf8").then(JSON.parse),
  ]);
  assert.equal(manifest.name, "@evetools/code-tui");
  assert.equal(manifest.bin.evecode, "./bin/evecode.mjs");
  assert.equal(manifest.bin["eve-agent"], "./bin/evecode.mjs");
  const pinnedEve = /^https:\/\/github\.com\/keejkrej\/eve\.git#[0-9a-f]{40}&path:\/packages\/eve$/;
  assert.match(manifest.peerDependencies.eve, pinnedEve);
  assert.equal(manifest.devDependencies.eve, manifest.peerDependencies.eve);
  assert.doesNotMatch(launcher, /patch-eve|prebuilt-runtime|dist\/runtime/);
  assert.match(runtime, /from "eve\/tui"/);
  assert.match(runtime, /ensureRuntime/);
  await assert.rejects(access("scripts/patch-eve.mjs"));
});

test("runtime settings use only Evecode internal override names", () => {
  assert.deepEqual(settingsEnvironment({
    model: "xiaomi/mimo-v2.5",
    reasoning: "high",
  }), {
    EVECODE_TUI_MODEL_OVERRIDE: "xiaomi/mimo-v2.5",
    EVECODE_TUI_REASONING_OVERRIDE: "high",
  });
});

test("model changes restart the dynamic runtime while reasoning changes rebuild it", () => {
  assert.equal(settingsRequireBuild(
    { model: "xiaomi/mimo-v2.5", reasoning: "high" },
    { model: "openai/gpt-5.6-luna", reasoning: "high" },
  ), false);
  assert.equal(settingsRequireBuild(
    { model: "xiaomi/mimo-v2.5", reasoning: "high" },
    { model: "xiaomi/mimo-v2.5", reasoning: "xhigh" },
  ), true);
  assert.equal(settingsRequireBuild({}, { reasoning: "high" }), false);
});

test("missing or stale source output requests a rebuild", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evecode-runtime-missing-"));
  assert.equal(await runtimeMatchesSettings(root, { model: "xiaomi/mimo-v2.5", reasoning: "high" }), false);
});

test("compiled runtime matching requires the shared dynamic model policy and reasoning", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "evecode-runtime-settings-"));
  const manifestPath = path.join(outputRoot, ".eve", "compile", "compiled-agent-manifest.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify({
    config: {
      dynamicModel: {
        eventNames: ["step.started"],
      },
      reasoning: "xhigh",
    },
  }));
  assert.equal(await runtimeMatchesSettings(outputRoot, {
    model: "xiaomi/mimo-v2.5",
    reasoning: "xhigh",
  }), true);
  assert.equal(await runtimeMatchesSettings(outputRoot, {
    model: "z-ai/glm-5.2",
    reasoning: "xhigh",
  }), true);
  assert.equal(await runtimeMatchesSettings(outputRoot, {
    model: "z-ai/glm-5.2",
    reasoning: "high",
  }), false);
});

test("TUI customization is supplied through the public fork seam", () => {
  const options = createTuiOptions({
    agentRoot: "/tmp/evecode-tui",
    serverUrl: "http://127.0.0.1:4321",
  });
  assert.equal(options.name, "Evecode");
  assert.deepEqual(options.target, {
    kind: "local",
    serverUrl: "http://127.0.0.1:4321",
    workspaceRoot: "/tmp/evecode-tui",
  });
  assert.equal(options.showVercelAuthSetupIssues, false);
  assert.deepEqual(options.externalProviderDisplayNames, { openrouter: "OpenRouter" });
  assert.match(options.headerTips?.join("\n") ?? "", /\/model/);
  assert.equal(typeof options.modelCommand, "function");
});

test("a failed model reload does not poison the next supervised reload", async () => {
  const first = scheduleAfterSettled(Promise.resolve(), async () => {
    throw new Error("first reload failed");
  });
  await assert.rejects(first, /first reload failed/);

  let secondRan = false;
  const second = scheduleAfterSettled(first, async () => {
    secondRan = true;
    return "reloaded";
  });
  assert.equal(await second, "reloaded");
  assert.equal(secondRan, true);
});

test("a server child is stopped when readiness fails before assignment", async () => {
  const signals: string[] = [];
  const childState = {
    exitCode: null as number | null,
    kill(signal: string) {
      signals.push(signal);
      childState.exitCode = 1;
      return true;
    },
  };
  const child = childState as unknown as ChildProcess;

  await assert.rejects(
    keepChildWhenReady(child, Promise.reject(new Error("not ready"))),
    /not ready/,
  );
  assert.deepEqual(signals, ["SIGTERM"]);
});

test("cleanup does not re-wait or re-signal a child already exited by signal", async () => {
  const child = {
    exitCode: null,
    signalCode: "SIGINT",
    kill() {
      throw new Error("must not re-signal");
    },
  } as unknown as ChildProcess;
  await assert.rejects(
    keepChildWhenReady(child, Promise.reject(new Error("startup interrupted"))),
    /startup interrupted/,
  );
});

test("cleanup escalates without hanging when a child ignores both signals", async () => {
  const child = new EventTarget() as unknown as ChildProcess & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  };
  child.exitCode = null;
  child.signalCode = null;
  const signals: NodeJS.Signals[] = [];
  child.kill = ((signal: NodeJS.Signals) => {
    signals.push(signal);
    return true;
  }) as ChildProcess["kill"];
  child.once = (() => child) as ChildProcess["once"];
  child.removeListener = (() => child) as ChildProcess["removeListener"];

  await stopChild(child, { graceMs: 1, killMs: 1 });
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});
