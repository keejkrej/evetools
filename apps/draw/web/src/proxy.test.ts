import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { clerk, protectedMiddleware } = vi.hoisted(() => ({
  clerk: {
    handler: undefined as
      | undefined
      | ((
          auth: () => Promise<{ userId: string | null }>,
          request: NextRequest,
        ) => Promise<Response | undefined>),
  },
  protectedMiddleware: vi.fn(() => new Response(null, { status: 204 })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: vi.fn((handler) => {
    clerk.handler = handler;
    return protectedMiddleware;
  }),
  createRouteMatcher:
    (patterns: string[]) =>
    (request: NextRequest) =>
      patterns.some((pattern) => {
        const prefix = pattern.replace("(.*)", "");
        return request.nextUrl.pathname.startsWith(prefix);
      }),
}));

import { config, proxy } from "./proxy";

const event = {} as Parameters<typeof proxy>[1];

describe("proxy public routes", () => {
  beforeEach(() => protectedMiddleware.mockClear());

  it.each([
    "/api/readiness",
    "/login",
    "/login/sso-callback",
    "/unauthorized",
    "/evedraw/api/readiness",
    "/evedraw/login",
    "/evedraw/unauthorized",
  ])(
    "bypasses Clerk middleware for %s",
    async (pathname) => {
      const response = await proxy(
        new NextRequest(`http://evedraw.localhost:3000${pathname}`),
        event,
      );

      expect(response?.status).toBe(200);
      expect(protectedMiddleware).not.toHaveBeenCalled();
    },
  );

  it("runs Clerk middleware for protected routes", async () => {
    const request = new NextRequest("http://evedraw.localhost:3000/evedraw");

    const response = await proxy(request, event);

    expect(response?.status).toBe(204);
    expect(protectedMiddleware).toHaveBeenCalledWith(request, event);
  });

  it("includes the base-path root in Next's middleware matcher", () => {
    expect(config.matcher).toContain("/");
  });

  it.each([
    { userId: null, status: 401, error: "Authentication required." },
    { userId: "not-owner", status: 403, error: "Access denied." },
  ])(
    "returns JSON $status for a protected API after Next strips the base path",
    async ({ userId, status, error }) => {
      vi.stubEnv("EVE_OWNER_USER_ID", "owner-1");
      const request = new NextRequest(
        "https://evedraw.localhost:3449/evedraw/api/models",
      );
      request.nextUrl.basePath = "/evedraw";
      request.nextUrl.pathname = "/api/models";

      const response = await clerk.handler?.(
        async () => ({ userId }),
        request,
      );

      expect(response?.status).toBe(status);
      await expect(response?.json()).resolves.toEqual({ error });
      vi.unstubAllEnvs();
    },
  );
});
