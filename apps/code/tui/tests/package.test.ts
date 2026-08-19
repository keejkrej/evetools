import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

interface PackFile {
  readonly path: string;
}

interface PackResult {
  readonly files: readonly PackFile[];
}

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

test("the package contains the runtime sources without generated artifacts", () => {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["pack", "--dry-run", "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  assert.equal(result.status, 0, result.stderr || result.error?.message);

  const manifest = JSON.parse(result.stdout) as PackResult;
  const paths = manifest.files.map(({ path }) => path);

  for (const requiredPath of [
    "agent/agent.ts",
    "bin/evecode.mjs",
    "bin/runtime.mjs",
    "src/config.ts",
    "src/models/providers.ts",
  ]) {
    assert.ok(paths.includes(requiredPath), `missing ${requiredPath}`);
  }

  for (const path of paths) {
    assert.doesNotMatch(
      path,
      /(^|\/)(?:\.output|dist)(?:\/|$)|patch-eve|active-settings\.generated|package-lock\.json|\.vercelignore$/,
    );
  }
});
