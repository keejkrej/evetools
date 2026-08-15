import { readFile } from "node:fs/promises";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { relativeToWorkspace, resolveWorkspacePath, truncateOutput, workspaceRoot } from "../lib/workspace.js";

export default defineTool({
  description: "Read a UTF-8 file from the active host coding workspace with line numbers. Paths are relative to the workspace root.",
  inputSchema: z.object({
    path: z.string().min(1),
    startLine: z.number().int().min(1).default(1),
    endLine: z.number().int().min(1).optional(),
  }),
  async execute({ path, startLine, endLine }) {
    const root = await workspaceRoot();
    const absolute = await resolveWorkspacePath(path);
    const content = await readFile(absolute, "utf8");
    const allLines = content.split("\n");
    const last = Math.min(endLine ?? (startLine + 499), allLines.length);
    const selected = allLines
      .slice(startLine - 1, last)
      .map((line, index) => `${startLine + index}\t${line}`)
      .join("\n");
    return {
      path: relativeToWorkspace(root, absolute),
      range: `${startLine}-${last}`,
      totalLines: allLines.length,
      content: truncateOutput(selected),
      truncatedByLines: last < allLines.length,
    };
  },
});
