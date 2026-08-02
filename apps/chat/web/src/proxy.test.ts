import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { protectedMiddleware } = vi.hoisted(() => ({
  protectedMiddleware: vi.fn(() => new Response(null, { status: 204 })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: vi.fn(() => protectedMiddleware),
  createRouteMatcher:
    (patterns: string[]) =>
    (request: NextRequest) =>
      patterns.some((pattern) => {
        const prefix = pattern.replace("(.*)", "");
        return request.nextUrl.pathname.startsWith(prefix);
      }),
}));

import { proxy } from "./proxy";

const event = {} as Parameters<typeof proxy>[1];

describe("proxy public routes", () => {
  beforeEach(() => protectedMiddleware.mockClear());

  it.each(["/api/readiness", "/login", "/login/sso-callback", "/unauthorized"])(
    "bypasses Clerk middleware for %s",
    async (pathname) => {
      const response = await proxy(
        new NextRequest(`http://127.0.0.1:43117${pathname}`),
        event,
      );

      expect(response?.status).toBe(200);
      expect(protectedMiddleware).not.toHaveBeenCalled();
    },
  );

  it("runs Clerk middleware for protected routes", async () => {
    const request = new NextRequest("http://127.0.0.1:43117/");

    const response = await proxy(request, event);

    expect(response?.status).toBe(204);
    expect(protectedMiddleware).toHaveBeenCalledWith(request, event);
  });
});
