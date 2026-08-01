import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth,
}));

import { GET } from "./route";

describe("desktop authentication callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVE_OWNER_USER_ID = "user_owner";
    process.env.CLERK_SECRET_KEY = "sk_test_callback_secret";
  });

  it("returns a short-lived signed callback to the native app", async () => {
    auth.mockResolvedValue({ userId: "user_owner" });

    const response = await GET();

    expect(response.headers.get("location")).toMatch(
      /^evedraw:\/\/callback\?token=[^.]+\.[^.]+$/,
    );
  });

  it("does not issue a ticket to a different user", async () => {
    auth.mockResolvedValue({ userId: "user_someone_else" });

    const response = await GET();

    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:43117/unauthorized",
    );
  });
});
