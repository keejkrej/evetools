import { NextRequest, NextResponse } from "next/server";
import { createDesktopSession, verifyDesktopSession } from "@/lib/desktop-session";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const secret = process.env.CLERK_SECRET_KEY;
  const owner = process.env.EVE_OWNER_USER_ID;
  if (!token || !secret || !owner) return new Response("Invalid or expired desktop sign-in.", { status: 401 });
  const verified = await verifyDesktopSession(token, secret);
  if (!verified || verified.userId !== owner) return new Response("Invalid or expired desktop sign-in.", { status: 401 });
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set("eve_desktop_session", await createDesktopSession(owner, secret, undefined, 30 * 24 * 60 * 60 * 1000), {
    httpOnly: true, maxAge: 30 * 24 * 60 * 60, path: "/", sameSite: "strict",
  });
  return response;
}
