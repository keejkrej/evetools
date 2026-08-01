import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/api/readiness",
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
    contentSecurityPolicy: {},
    publishableKey:
      process.env.EVE_CLERK_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
);

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isPublicRoute(request)) return NextResponse.next();
  return protectedRouteMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
