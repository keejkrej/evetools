import { authorizeOwner } from "@/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await authorizeOwner();
  if (unauthorized) return unauthorized;

  return Response.json(
    {
      status:
        process.env.CURSOR_API_KEY || process.env.OLLAMA_API_KEY
          ? "ready"
          : "missing_key",
      providers: {
        cursor: Boolean(process.env.CURSOR_API_KEY),
        ollama: Boolean(process.env.OLLAMA_API_KEY),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
