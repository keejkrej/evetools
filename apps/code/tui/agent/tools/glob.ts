import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { truncateOutput, workspaceRoot } from "../lib/workspace.js";

const execFileAsync = promisify(execFile);

export default defineTool({
  description: "List files in the active host coding workspace matching a glob. Respects ignore files when ripgrep is available.",
  inputSchema: z.object({ pattern: z.string().min(1).default("**/*") }),
  async execute({ pattern }) {
    const cwd = await workspaceRoot();
    try {
      const { stdout } = await execFileAsync("rg", ["--files", "-g", pattern], { cwd, maxBuffer: 5_000_000 });
      return { pattern, files: truncateOutput(stdout) };
    } catch (error: unknown) {
      const candidate = error as { code?: number; message?: string };
      if (candidate.code === 1) return { pattern, files: "" };
      throw new Error(candidate.message ?? String(error));
    }
  },
});
