import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { relativeToWorkspace, resolveWorkspacePath, workspaceRoot } from "../lib/workspace.js";

export default defineTool({
  description: "Atomically create or replace a UTF-8 file in the active host coding workspace. Read existing files first and preserve unrelated content.",
  approval: always(),
  inputSchema: z.object({ path: z.string().min(1), content: z.string() }),
  async execute({ path: inputPath, content }) {
    const root = await workspaceRoot();
    const absolute = await resolveWorkspacePath(inputPath);
    await mkdir(path.dirname(absolute), { recursive: true });
    const temporary = `${absolute}.evecode-${randomUUID()}.tmp`;
    const existingMode = await stat(absolute)
      .then((value) => value.mode & 0o7777)
      .catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      });
    await writeFile(temporary, content, "utf8");
    if (existingMode !== undefined) await chmod(temporary, existingMode);
    await rename(temporary, absolute);
    return { ok: true, path: relativeToWorkspace(root, absolute), bytes: Buffer.byteLength(content) };
  },
});
