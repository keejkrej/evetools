import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { eveInvocation, tsxInvocation } from "../bin/subprocess.mjs";

test("framework subprocesses use Node with package entrypoints instead of platform shims", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const eve = eveInvocation(root, ["build"]);
  const tsx = tsxInvocation(root, ["bin/evecode-cli.ts", "--help"]);

  assert.equal(eve.command, process.execPath);
  assert.equal(path.basename(eve.args[0]!), "eve.js");
  assert.equal(path.basename(path.dirname(eve.args[0]!)), "bin");
  assert.deepEqual(eve.args.slice(1), ["build"]);

  assert.equal(tsx.command, process.execPath);
  assert.equal(path.basename(tsx.args[0]!), "cli.mjs");
  assert.match(tsx.args[0]!, /node_modules[\\/]tsx[\\/]dist[\\/]cli\.mjs$/);
  assert.deepEqual(tsx.args.slice(1), ["bin/evecode-cli.ts", "--help"]);
});
