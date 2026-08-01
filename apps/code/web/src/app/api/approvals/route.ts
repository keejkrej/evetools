import { z } from "zod";
import { decideApproval, listApprovals } from "@/lib/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  id: z.string().uuid(),
  approved: z.boolean(),
});

export async function GET(request: Request) {
  const threadId = new URL(request.url).searchParams.get("threadId");
  if (!threadId) return Response.json({ error: "threadId is required." }, { status: 400 });
  return Response.json({ approvals: listApprovals(threadId) });
}

export async function POST(request: Request) {
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid approval decision." }, { status: 400 });
  if (!decideApproval(parsed.data.id, parsed.data.approved)) {
    return Response.json({ error: "Approval is no longer pending." }, { status: 404 });
  }
  return Response.json({ decided: true });
}
