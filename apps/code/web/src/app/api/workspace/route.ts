import path from "node:path";
import { listWorkspaceFiles, readWorkspaceFile, searchWorkspaceFiles, workspaceDiff, workspaceRoot, workspaceStatus } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    const view = url.searchParams.get("view");
    const search = url.searchParams.get("search");
    if (file) return Response.json({ file, content: await readWorkspaceFile(file) });
    if (search) return Response.json({ query: search, matches: await searchWorkspaceFiles(search) });
    if (view === "diff") return Response.json({ diff: await workspaceDiff(), changes: await workspaceStatus() });
    if (view === "status") return Response.json({ changes: await workspaceStatus() });
    const root = workspaceRoot();
    return Response.json({
      configured: true,
      name: path.basename(root),
      root,
      files: await listWorkspaceFiles(),
      changes: await workspaceStatus(),
    });
  } catch (error) {
    return Response.json(
      { configured: false, error: error instanceof Error ? error.message : "Workspace unavailable." },
      { status: 503 },
    );
  }
}
