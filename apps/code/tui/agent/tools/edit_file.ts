import { randomUUID } from "node:crypto";
import { chmod, readFile, rename, stat, writeFile } from "node:fs/promises";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { relativeToWorkspace, resolveWorkspacePath, workspaceRoot } from "../lib/workspace.js";

export default defineTool({
  description: "Make a precise edit in a host workspace file by replacing one exact, unique string. Prefer this over rewriting a whole existing file.",
  approval: always(),
  inputSchema: z.object({
    path: z.string().min(1),
    oldText: z.string().min(1).describe("Exact text expected to occur once"),
    newText: z.string().describe("Replacement text"),
  }),
  async execute({ path: inputPath, oldText, newText }) {
    const root = await workspaceRoot();
    const absolute = await resolveWorkspacePath(inputPath);
    const content = await readFile(absolute, "utf8");
    const first = content.indexOf(oldText);
    if (first < 0) throw new Error("oldText was not found; re-read the file and use an exact match");
    if (content.indexOf(oldText, first + oldText.length) >= 0) {
      throw new Error("oldText occurs more than once; include more surrounding context");
    }
    const updated = content.slice(0, first) + newText + content.slice(first + oldText.length);
    const temporary = `${absolute}.evecode-${randomUUID()}.tmp`;
    const existingMode = (await stat(absolute)).mode & 0o7777;
    await writeFile(temporary, updated, "utf8");
    await chmod(temporary, existingMode);
    await rename(temporary, absolute);
    return { ok: true, path: relativeToWorkspace(root, absolute), replacements: 1 };
  },
});
