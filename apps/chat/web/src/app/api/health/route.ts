import { authorizeOwner } from "@/lib/owner-auth";
import { hasOpenRouterApiKey } from "@evetools/openrouter/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await authorizeOwner();
  if (unauthorized) return unauthorized;
  const configured = hasOpenRouterApiKey();

  return Response.json(
    {
      status: configured ? "ready" : "missing_key",
      providers: {
        openrouter: configured,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
