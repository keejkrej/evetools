import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const IGNORED = new Set([".git", ".next", ".turbo", "node_modules", "dist", "build"]);

export function workspaceRoot(): string {
  const configured = process.env.EVECODE_WORKSPACE_ROOT;
  if (configured) return path.resolve(configured);

  const root = path.join(homedir(), ".evetools", "code");
  mkdirSync(root, { recursive: true });
  return root;
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

export type WorkspaceSearchResult = { path: string; line: number; column: number; preview: string };
export type WorkspaceChange = { path: string; index: string; workingTree: string; originalPath?: string };

export async function searchWorkspaceFiles(query: string, limit = 100): Promise<WorkspaceSearchResult[]> {
  const needle = query.toLocaleLowerCase();
  const results: WorkspaceSearchResult[] = [];
  for (const relativePath of await listWorkspaceFiles()) {
    if (results.length >= limit) break;
    let content: string;
    try {
      content = await readWorkspaceFile(relativePath);
    } catch {
      continue;
    }
    if (content.includes("\0")) continue;
    const lines = content.split("\n");
    for (let index = 0; index < lines.length && results.length < limit; index += 1) {
      const column = lines[index].toLocaleLowerCase().indexOf(needle);
      if (column >= 0) results.push({
        path: relativePath,
        line: index + 1,
        column: column + 1,
        preview: lines[index].trim().slice(0, 300),
      });
    }
  }
  return results;
}

export async function workspaceStatus(): Promise<WorkspaceChange[]> {
  const result = await runWorkspaceCommand("git status --porcelain=v1 -z --untracked-files=all");
  if (result.exitCode !== 0) return [];
  const entries = result.output.split("\0");
  const changes: WorkspaceChange[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) continue;
    const change: WorkspaceChange = { path: entry.slice(3), index: entry[0], workingTree: entry[1] };
    if (entry[0] === "R" || entry[0] === "C") change.originalPath = entries[++index];
    changes.push(change);
  }
  return changes;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export async function workspaceDiff(relativePath?: string): Promise<string> {
  if (relativePath) {
    resolveWorkspacePath(relativePath);
    const result = await runWorkspaceCommand(`git diff --no-ext-diff -- ${shellQuote(relativePath)}`);
    if (result.exitCode !== 0 || !result.output.trim()) return `No uncommitted changes for ${relativePath}.`;
    return result.output;
  }
  const result = await runWorkspaceCommand("git diff --no-ext-diff --stat && git diff --no-ext-diff -- . ':(exclude)pnpm-lock.yaml'");
  return result.exitCode === 0 ? (result.output || "No uncommitted changes.") : "No uncommitted changes.";
}
