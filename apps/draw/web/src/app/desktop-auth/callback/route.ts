import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createDesktopSession } from "@/lib/desktop-session";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  const owner = process.env.EVE_OWNER_USER_ID;
  const state = request.nextUrl.searchParams.get("state");
  if (!userId) return NextResponse.redirect(new URL(`/login?desktop=1&state=${encodeURIComponent(state ?? "")}`, request.url));
  if (!owner || userId !== owner) return NextResponse.redirect(new URL("/unauthorized", request.url));
  if (!state) return new Response("Missing desktop authentication state.", { status: 400 });
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return new Response("Desktop authentication is not configured.", { status: 500 });
  const callback = new URL("evedraw://callback");
  callback.searchParams.set("state", state);
  callback.searchParams.set("token", await createDesktopSession(userId, secret, state));
  return NextResponse.redirect(callback);
}
