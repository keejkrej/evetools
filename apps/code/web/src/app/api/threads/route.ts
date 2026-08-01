import { newCodeThread, listThreads, replaceThreads, saveThread } from "@/lib/threads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Thread storage unavailable." },
    { status: 400 },
  );
}

export async function GET() {
  try {
    return Response.json({ threads: await listThreads() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const thread = body?.thread ?? newCodeThread();
    return Response.json({ thread: await saveThread(thread) }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    return Response.json({ threads: await replaceThreads(body?.threads) });
  } catch (error) {
    return failure(error);
  }
}
