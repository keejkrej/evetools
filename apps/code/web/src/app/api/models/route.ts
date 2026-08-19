import { listModels } from "@evetools/models/server";
import { enforceLocalRequest } from "@/lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const forbidden = enforceLocalRequest(request);
  if (forbidden) return forbidden;
  return Response.json(await listModels());
}
