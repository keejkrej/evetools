import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  dispatchEvecodeCommand,
  parseEvecodeCommand,
  type EvecodeCommand,
} from "../bin/commands.mjs";
import { resolveLaunchWorkspace } from "../bin/workspace.mjs";

test("the unified parser selects explicit TUI and web surfaces", () => {
  assert.deepEqual(
    parseEvecodeCommand(["launch", "tui", "--model", "xiaomi/mimo-v2.5", "./repo"]),
    {
      kind: "tui",
      model: "xiaomi/mimo-v2.5",
      transitional: false,
      workspace: "./repo",
    },
  );
  assert.deepEqual(
    parseEvecodeCommand(["launch", "web", "--port=4312", "--no-open", "./repo"]),
    { kind: "web", open: false, port: 4312, workspace: "./repo" },
  );
});

test("direct TUI and auth status remain compatibility aliases", () => {
  assert.deepEqual(parseEvecodeCommand(["."]), {
    kind: "tui",
    model: undefined,
    transitional: true,
    workspace: ".",
  });
  assert.deepEqual(parseEvecodeCommand(["status"]), {
    kind: "management",
    args: ["status"],
  });
  assert.deepEqual(parseEvecodeCommand(["auth", "status"]), {
    kind: "management",
    args: ["auth", "status"],
  });
});

test("dispatcher invokes only the selected product surface", async () => {
  const calls: string[] = [];
  const command: EvecodeCommand = parseEvecodeCommand(["launch", "web", "--no-open"]);
  const result = await dispatchEvecodeCommand(command, {
    management: async () => { calls.push("management"); return 1; },
    tui: async () => { calls.push("tui"); return 2; },
    web: async () => { calls.push("web"); return 3; },
  });
  assert.equal(result, 3);
  assert.deepEqual(calls, ["web"]);
});

test("surface parsers reject invalid or ambiguous launch arguments", () => {
  assert.throws(() => parseEvecodeCommand(["launch", "desktop"]), /tui\|web/);
  assert.throws(() => parseEvecodeCommand(["launch", "web", "--port", "0"]), /1 to 65535/);
  assert.throws(() => parseEvecodeCommand(["launch", "tui", "one", "two"]), /at most one/);
});

test("both surfaces share positional, environment, INIT_CWD, and cwd workspace resolution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evecode-launch-workspace-"));
  const positional = path.join(root, "positional");
  const configured = path.join(root, "configured");
  const initial = path.join(root, "initial");
  await Promise.all([positional, configured, initial].map((directory) => mkdir(directory)));
  const env: NodeJS.ProcessEnv = { EVECODE_WORKSPACE_ROOT: configured, INIT_CWD: initial };

  assert.equal(await resolveLaunchWorkspace(positional, { env, cwd: root }), await realpath(positional));
  assert.equal(await resolveLaunchWorkspace(undefined, { env, cwd: root }), await realpath(configured));
  delete env.EVECODE_WORKSPACE_ROOT;
  assert.equal(await resolveLaunchWorkspace(undefined, { env, cwd: root }), await realpath(initial));
  delete env.INIT_CWD;
  assert.equal(await resolveLaunchWorkspace(undefined, { env, cwd: root }), await realpath(root));

  const file = path.join(root, "not-a-directory");
  await writeFile(file, "x");
  await assert.rejects(resolveLaunchWorkspace(file, { env, cwd: root }), /not a directory/);
});
