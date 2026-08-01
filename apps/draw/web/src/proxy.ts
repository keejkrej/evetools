import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { verifyDesktopSession } from "@/lib/desktop-session";

const isPublicRoute = createRouteMatcher([
  "/api/readiness",
  "/desktop-auth/complete",
  "/login(.*)",
  "/unauthorized",
]);

const protectedRouteMiddleware = clerkMiddleware(
  async (auth, request) => {
    const { userId } = await auth();
    if (!userId) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Authentication required." },
          { status: 401 },
        );
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const ownerUserId = process.env.EVE_OWNER_USER_ID;
    if (!ownerUserId || userId !== ownerUserId) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
  },
  {
    authorizedParties: process.env.EVEDRAW_DESKTOP === "1"
      ? ["http://127.0.0.1:43117", "http://localhost:43117"]
      : undefined,
    contentSecurityPolicy: {},
    publishableKey:
      process.env.EVE_CLERK_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
);

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  if (process.env.EVEDRAW_DESKTOP === "1") {
    const token = request.cookies.get("eve_desktop_session")?.value;
    const secret = process.env.CLERK_SECRET_KEY;
    const owner = process.env.EVE_OWNER_USER_ID;
    if (token && secret && owner && (await verifyDesktopSession(token, secret)) === owner) {
      return NextResponse.next();
    }
  }

  return protectedRouteMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
