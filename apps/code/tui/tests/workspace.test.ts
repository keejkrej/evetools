import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveWorkspacePath, truncateOutput, workspaceRoot } from "../agent/lib/workspace.js";
import editFile from "../agent/tools/edit_file.js";
import writeFileTool from "../agent/tools/write_file.js";

test("workspace paths stay inside the selected root", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "evecode-path-"));
  const root = path.join(base, "repo");
  const outside = path.join(base, "outside");
  await mkdir(root);
  await mkdir(outside);
  await symlink(outside, path.join(root, "escape"));
  process.env.EVECODE_WORKSPACE_ROOT = root;

  const canonicalRoot = await workspaceRoot();
  assert.equal(canonicalRoot, await import("node:fs/promises").then(({ realpath }) => realpath(root)));
  await assert.rejects(resolveWorkspacePath("../outside/file.txt"), /escapes the coding workspace/);
  await assert.rejects(resolveWorkspacePath("escape/file.txt"), /symlink outside/);
  assert.equal(await resolveWorkspacePath("src/new.ts"), path.join(canonicalRoot, "src/new.ts"));
  assert.equal(await resolveWorkspacePath("..config"), path.join(canonicalRoot, "..config"));
  assert.equal(await resolveWorkspacePath("..cache/file"), path.join(canonicalRoot, "..cache/file"));
});

test("atomic edit and write replacements preserve executable file modes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evecode-mode-"));
  process.env.EVECODE_WORKSPACE_ROOT = root;
  const editTarget = path.join(root, "edit.sh");
  const writeTarget = path.join(root, "write.sh");
  await writeFile(editTarget, "#!/bin/sh\necho before\n");
  await writeFile(writeTarget, "#!/bin/sh\necho before\n");
  await chmod(editTarget, 0o755);
  await chmod(writeTarget, 0o751);

  await editFile.execute({
    path: "edit.sh",
    oldText: "echo before",
    newText: "echo after",
  }, {} as never);
  await writeFileTool.execute({
    path: "write.sh",
    content: "#!/bin/sh\necho after\n",
  }, {} as never);

  assert.equal((await stat(editTarget)).mode & 0o777, 0o755);
  assert.equal((await stat(writeTarget)).mode & 0o777, 0o751);
  assert.match(await readFile(editTarget, "utf8"), /echo after/);
  assert.match(await readFile(writeTarget, "utf8"), /echo after/);
});

test("long output keeps useful context from both ends", () => {
  const output = truncateOutput(`HEAD${"x".repeat(1_000)}TAIL`, 100);
  assert.match(output, /^HEAD/);
  assert.match(output, /characters omitted/);
  assert.match(output, /TAIL$/);
});
