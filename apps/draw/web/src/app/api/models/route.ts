import { listOpenRouterModels } from "@evetools/openrouter/server";
import { authorizeOwner } from "@/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await authorizeOwner();
  if (unauthorized) return unauthorized;

  return Response.json(await listOpenRouterModels({ requireTools: true }));
}
