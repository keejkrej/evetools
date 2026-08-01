import { deleteThread, saveThread } from "@/lib/threads";

export const runtime = "nodejs";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (body?.thread?.id !== id) return Response.json({ error: "Thread ID does not match route." }, { status: 400 });
    return Response.json({ thread: await saveThread(body.thread) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save thread." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const deleted = await deleteThread(id);
  return deleted ? new Response(null, { status: 204 }) : Response.json({ error: "Thread not found." }, { status: 404 });
}
