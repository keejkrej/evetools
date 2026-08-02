import { NextRequest, NextResponse } from "next/server";
import { consumeDesktopAuthentication } from "@/lib/desktop-auth-store";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  if (!state) return new Response("Missing desktop authentication state.", { status: 400 });
  const token = consumeDesktopAuthentication(state);
  if (!token) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
