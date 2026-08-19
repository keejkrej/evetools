import { spawn } from "node:child_process";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { hostShellInvocation } from "../lib/host-shell.js";
import { terminateProcessTree } from "../lib/process-tree.js";
import { truncateOutput, workspaceRoot } from "../lib/workspace.js";

export default defineTool({
  description: "Run a shell command directly in the active host coding workspace. Use for Git, tests, builds, package managers, and repository inspection. Commands have the user's host permissions.",
  approval: ({ toolInput }) => {
    const command = typeof toolInput?.command === "string" ? toolInput.command : "";
    const dangerous = /(?:^|[;&|]\s*)(?:sudo\b|rm\s+-[^\n]*r[^\n]*f|git\s+(?:push\b|clean\b|reset\s+--hard\b)|npm\s+publish\b|pnpm\s+publish\b|yarn\s+npm\s+publish\b|vercel\s+(?:deploy|--prod)\b|(?:curl|wget)[^\n|]*\|\s*(?:sh|bash|zsh)\b)/i;
    return dangerous.test(command) ? "user-approval" : "not-applicable";
  },
  inputSchema: z.object({
    command: z.string().min(1).describe("Shell command to execute with the host's configured shell"),
    timeoutSeconds: z.number().int().min(1).max(3600).default(120),
  }),
  async execute({ command, timeoutSeconds }, ctx) {
    const cwd = await workspaceRoot();
    const shell = hostShellInvocation(command);
    return new Promise<Record<string, unknown>>((resolve) => {
      const child = spawn(shell.command, shell.args, {
        cwd,
        env: process.env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let finished = false;
      let stopReason: "cancelled" | "timeout" | undefined;
      let exitCode: number | null = null;
      let exitSignal: NodeJS.Signals | null = null;
      let spawnError: Error | undefined;
      const append = (current: string, chunk: Buffer) => truncateOutput(current + chunk.toString(), 2_000_000);
      child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
      child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });

      const cleanup = () => {
        clearTimeout(timeout);
        ctx.abortSignal.removeEventListener("abort", cancel);
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve({
          ok: exitCode === 0 && spawnError === undefined && stopReason === undefined,
          exitCode,
          signal: exitSignal,
          timedOut: stopReason === "timeout",
          cancelled: stopReason === "cancelled",
          ...(spawnError === undefined ? {} : { error: spawnError.message }),
          cwd,
          stdout: truncateOutput(stdout),
          stderr: truncateOutput(stderr),
        });
      };

      const stop = (reason: "cancelled" | "timeout") => {
        if (finished || stopReason !== undefined) return;
        stopReason = reason;
        clearTimeout(timeout);
        void terminateProcessTree(child).then(finish, finish);
      };

      const cancel = () => stop("cancelled");
      const timeout = setTimeout(() => stop("timeout"), timeoutSeconds * 1000);
      if (ctx.abortSignal.aborted) cancel();
      else ctx.abortSignal.addEventListener("abort", cancel, { once: true });

      child.on("error", (error) => {
        spawnError = error;
        if (stopReason === undefined) finish();
      });
      child.on("close", (code, signal) => {
        exitCode = code;
        exitSignal = signal;
        if (stopReason === undefined) finish();
      });
    });
  },
});
