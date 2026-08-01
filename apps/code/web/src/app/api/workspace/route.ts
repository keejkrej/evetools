import path from "node:path";
import { listWorkspaceFiles, readWorkspaceFile, workspaceDiff, workspaceRoot } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    const view = url.searchParams.get("view");
    if (file) return Response.json({ file, content: await readWorkspaceFile(file) });
    if (view === "diff") return Response.json({ diff: await workspaceDiff() });
    const root = workspaceRoot();
    return Response.json({
      configured: true,
      name: path.basename(root),
      root,
      files: await listWorkspaceFiles(),
    });
  } catch (error) {
    return Response.json(
      { configured: false, error: error instanceof Error ? error.message : "Workspace unavailable." },
      { status: 503 },
    );
  }
}
