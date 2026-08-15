import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const EVEDRAW_BASE_PATH = "/evedraw";

const isPublicRoute = createRouteMatcher([
  "/api/readiness",
  "/evedraw/api/readiness",
  "/login(.*)",
  "/evedraw/login(.*)",
  "/unauthorized",
  "/evedraw/unauthorized",
]);

function requestBasePath(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isEvedrawPath =
    pathname === EVEDRAW_BASE_PATH ||
    pathname.startsWith(`${EVEDRAW_BASE_PATH}/`);
  return (
    request.nextUrl.basePath ||
    (isEvedrawPath ? EVEDRAW_BASE_PATH : "")
  );
}

function isApiPath(request: NextRequest) {
  const basePath = requestBasePath(request);
  const { pathname } = request.nextUrl;
  const normalizedPathname =
    basePath &&
    (pathname === basePath || pathname.startsWith(`${basePath}/`))
      ? pathname.slice(basePath.length) || "/"
      : pathname;
  return normalizedPathname.startsWith("/api/");
}

const protectedRouteMiddleware = clerkMiddleware(
  async (auth, request) => {
    const { userId } = await auth();
    if (!userId) {
      if (isApiPath(request)) {
        return NextResponse.json(
          { error: "Authentication required." },
          { status: 401 },
        );
      }
      return NextResponse.redirect(
        new URL(
          `${requestBasePath(request)}/login`,
          request.url,
        ),
      );
    }

    const ownerUserId = process.env.EVE_OWNER_USER_ID;
    if (!ownerUserId || userId !== ownerUserId) {
      if (isApiPath(request)) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
      return NextResponse.redirect(
        new URL(
          `${requestBasePath(request)}/unauthorized`,
          request.url,
        ),
      );
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
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  return protectedRouteMiddleware(request, event);
}

export const config = {
  matcher: [
    "/",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
