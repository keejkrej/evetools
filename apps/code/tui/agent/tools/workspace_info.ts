import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { hostShellInvocation } from "../lib/host-shell.js";
import { workspaceRoot } from "../lib/workspace.js";

const execFileAsync = promisify(execFile);

export default defineTool({
  description: "Inspect the active host coding workspace. Call this at the start of a task to learn the repository root, Git state, and top-level files.",
  inputSchema: z.object({}),
  async execute() {
    const root = await workspaceRoot();
    const run = async (args: string[]) => {
      try {
        const { stdout, stderr } = await execFileAsync("git", args, { cwd: root, maxBuffer: 2_000_000 });
        return `${stdout}${stderr}`.trim();
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    const listing = process.platform === "win32"
      ? hostShellInvocation("dir /b")
      : hostShellInvocation("find . -maxdepth 2 -not -path './.git*' -not -path './node_modules*' | sort | head -200");
    const { stdout: files = "" } = await execFileAsync(listing.command, listing.args, {
      cwd: root,
      maxBuffer: 2_000_000,
    });
    return {
      root,
      branch: await run(["branch", "--show-current"]),
      status: await run(["status", "--short", "--branch"]),
      files: files.trim().split(/\r?\n/u).slice(0, 200).join("\n"),
    };
  },
});
