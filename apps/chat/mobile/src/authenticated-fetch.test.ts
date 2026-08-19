import { describe, expect, it, vi } from "vitest";

import {
  createAuthenticatedFetch,
  type FetchImplementation,
} from "./authenticated-fetch";

describe("mobile authenticated API client", () => {
  it("adds the current Clerk session token to every protected Chat endpoint", async () => {
    const getToken = vi.fn(async () => "session-token");
    const fetchImpl = vi.fn<FetchImplementation>(
      async () => new Response(null, { status: 204 }),
    );
    const authenticatedFetch = createAuthenticatedFetch(getToken, fetchImpl);

    await authenticatedFetch("https://eve.example/api/health");
    await authenticatedFetch("https://eve.example/api/models");
    await authenticatedFetch("https://eve.example/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(getToken).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer session-token",
      );
    }
    expect(
      new Headers(fetchImpl.mock.calls[2][1]?.headers).get("Content-Type"),
    ).toBe("application/json");
  });

  it("does not issue an unauthenticated request when the session has no token", async () => {
    const fetchImpl = vi.fn<FetchImplementation>();
    const authenticatedFetch = createAuthenticatedFetch(
      async () => null,
      fetchImpl,
    );

    await expect(
      authenticatedFetch("https://eve.example/api/health"),
    ).rejects.toThrow("Authentication required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
