import { authorizeOwner } from "@/lib/owner-auth";
import { hasOpenAiConfig } from "@evetools/models/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await authorizeOwner();
  if (unauthorized) return unauthorized;
  const configured = hasOpenAiConfig();

  return Response.json(
    {
      status: configured ? "ready" : "missing_key",
      providers: {
        openai: configured,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
