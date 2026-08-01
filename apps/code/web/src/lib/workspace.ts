import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const IGNORED = new Set([".git", ".next", ".turbo", "node_modules", "dist", "build"]);

export function workspaceRoot(): string {
  const configured = process.env.EVECODE_WORKSPACE_ROOT;
  if (!configured) throw new Error("EVECODE_WORKSPACE_ROOT is not configured.");
  return path.resolve(configured);
}

export function resolveWorkspacePath(relativePath: string): string {
  const root = workspaceRoot();
  const resolved = path.resolve(root, relativePath || ".");
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path escapes the configured workspace.");
  }
  return resolved;
}

export async function listWorkspaceFiles(limit = 400): Promise<string[]> {
  const root = workspaceRoot();
  const files: string[] = [];
  const visit = async (directory: string) => {
    if (files.length >= limit) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= limit || IGNORED.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute));
    }
  };
  await visit(root);
  return files;
}

async function assertRealPathInsideWorkspace(candidate: string): Promise<string> {
  const root = await fs.realpath(workspaceRoot());
  const realCandidate = await fs.realpath(candidate);
  if (realCandidate !== root && !realCandidate.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path escapes the configured workspace through a symbolic link.");
  }
  return realCandidate;
}

export async function readWorkspaceFile(relativePath: string): Promise<string> {
  const file = await assertRealPathInsideWorkspace(resolveWorkspacePath(relativePath));
  const value = await fs.readFile(file, "utf8");
  return value.length > 100_000 ? `${value.slice(0, 100_000)}\n…truncated` : value;
}

export async function writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
  const destination = resolveWorkspacePath(relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await assertRealPathInsideWorkspace(path.dirname(destination));
  const existing = await fs.lstat(destination).catch(() => null);
  if (existing) await assertRealPathInsideWorkspace(destination);
  await fs.writeFile(destination, content, "utf8");
}

export async function runWorkspaceCommand(command: string): Promise<{ output: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("/bin/sh", ["-lc", command], {
      cwd: workspaceRoot(),
      timeout: 120_000,
      maxBuffer: 1_000_000,
    });
    return { output: `${stdout}${stderr}`.slice(0, 100_000), exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string; message?: string };
    return {
      output: `${failure.stdout ?? ""}${failure.stderr ?? failure.message ?? "Command failed."}`.slice(0, 100_000),
      exitCode: typeof failure.code === "number" ? failure.code : 1,
    };
  }
}

export async function workspaceDiff(): Promise<string> {
  const result = await runWorkspaceCommand("git diff --no-ext-diff --stat && git diff --no-ext-diff -- . ':(exclude)pnpm-lock.yaml'");
  return result.output || "No uncommitted changes.";
}
