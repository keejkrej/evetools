import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createDesktopSession } from "@/lib/desktop-session";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect("http://127.0.0.1:43117/login?browser=1");
  }
  if (userId !== process.env.EVE_OWNER_USER_ID) {
    return NextResponse.redirect("http://127.0.0.1:43117/unauthorized");
  }

  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return new Response("Desktop authentication is not configured.", { status: 500 });
  const callback = new URL("evedraw://callback");
  callback.searchParams.set("token", await createDesktopSession(userId, secret));
  return NextResponse.redirect(callback);
}
