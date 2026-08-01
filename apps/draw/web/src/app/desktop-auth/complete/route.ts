import { NextRequest, NextResponse } from "next/server";
import { createDesktopSession, verifyDesktopSession } from "@/lib/desktop-session";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const secret = process.env.CLERK_SECRET_KEY;
  const owner = process.env.EVE_OWNER_USER_ID;
  if (!token || !secret || !owner || (await verifyDesktopSession(token, secret)) !== owner) {
    return new Response("Invalid or expired desktop sign-in.", { status: 401 });
  }

  const response = NextResponse.redirect("http://127.0.0.1:43117/");
  const session = await createDesktopSession(owner, secret, 60 * 60 * 24 * 30 * 1000);
  response.cookies.set("eve_desktop_session", session, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "strict",
  });
  return response;
}
