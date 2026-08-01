import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveWorkspacePath, searchWorkspaceFiles, workspaceStatus, writeWorkspaceFile } from "./workspace";

let root = "";
const originalRoot = process.env.EVECODE_WORKSPACE_ROOT;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "evecode-workspace-"));
  process.env.EVECODE_WORKSPACE_ROOT = root;
});

afterEach(async () => {
  if (originalRoot === undefined) delete process.env.EVECODE_WORKSPACE_ROOT;
  else process.env.EVECODE_WORKSPACE_ROOT = originalRoot;
  await rm(root, { recursive: true, force: true });
});

describe("workspace path confinement", () => {
  it("resolves paths inside the configured root", () => {
    expect(resolveWorkspacePath("src/index.ts")).toBe(path.join(root, "src/index.ts"));
  });

  it("rejects traversal outside the configured root", () => {
    expect(() => resolveWorkspacePath("../secret.txt")).toThrow(
      "Path escapes the configured workspace.",
    );
  });

  it("creates parent directories and writes files", async () => {
    await writeWorkspaceFile("src/generated.ts", "export const generated = true;\n");
    await expect(readFile(path.join(root, "src/generated.ts"), "utf8")).resolves.toBe(
      "export const generated = true;\n",
    );
  });

  it("returns structured, case-insensitive text search matches", async () => {
    await writeWorkspaceFile("src/first.ts", "const Needle = true;\n");
    await writeWorkspaceFile("src/second.ts", "// no match\nneedle();\n");
    await expect(searchWorkspaceFiles("NEEDLE")).resolves.toEqual([
      { path: "src/first.ts", line: 1, column: 7, preview: "const Needle = true;" },
      { path: "src/second.ts", line: 2, column: 1, preview: "needle();" },
    ]);
  });

  it("returns an empty Git status outside a repository", async () => {
    await expect(workspaceStatus()).resolves.toEqual([]);
  });

  it("rejects writes through symlinks that leave the workspace", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "evecode-outside-"));
    try {
      const target = path.join(outside, "secret.txt");
      await writeFile(target, "unchanged");
      await symlink(target, path.join(root, "escape.txt"));
      await expect(writeWorkspaceFile("escape.txt", "changed")).rejects.toThrow(
        "escapes the configured workspace through a symbolic link",
      );
      await expect(readFile(target, "utf8")).resolves.toBe("unchanged");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
