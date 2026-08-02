import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createDesktopSession } from "@/lib/desktop-session";
import { publishDesktopAuthentication } from "@/lib/desktop-auth-store";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  const owner = process.env.EVE_OWNER_USER_ID;
  const state = request.nextUrl.searchParams.get("state");
  if (!userId) return NextResponse.redirect(new URL(`/login?desktop=1&state=${encodeURIComponent(state ?? "")}`, request.url));
  if (!owner || userId !== owner) return NextResponse.redirect(new URL("/unauthorized", request.url));
  if (!state) return new Response("Missing desktop authentication state.", { status: 400 });
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return new Response("Desktop authentication is not configured.", { status: 500 });
  const token = await createDesktopSession(userId, secret, state, 5 * 60_000);
  publishDesktopAuthentication(state, token);
  const callback = new URL("evedraw://callback");
  callback.searchParams.set("state", state);
  callback.searchParams.set("token", token);
  const callbackUrl = callback.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Return to Evedraw</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#171717;font:16px system-ui,sans-serif}.card{text-align:center;padding:32px}.mark{font-size:34px;font-weight:800}.muted{color:#666}a{display:inline-block;margin-top:12px;padding:10px 16px;border-radius:12px;background:#171717;color:#fff;text-decoration:none}</style></head><body><main class="card"><div class="mark">EVE</div><h1>Sign-in complete</h1><p class="muted">Evedraw will finish signing in automatically. You can close this tab.</p><a href="${callbackUrl}">Open Evedraw manually</a></main></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
