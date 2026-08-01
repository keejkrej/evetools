import { subscribeToTurn } from "@/lib/turns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const value = Number(new URL(request.url).searchParams.get("after") ?? "0");
  const after = Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return subscribeToTurn(id, after) ?? Response.json({ error: "Turn is not available." }, { status: 404 });
}
