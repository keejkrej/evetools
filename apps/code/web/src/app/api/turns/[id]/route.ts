import { stopTurn } from "@/lib/turns";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return stopTurn(id) ? new Response(null, { status: 204 }) : Response.json({ error: "Running turn not found." }, { status: 404 });
}
