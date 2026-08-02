import { describe, expect, it } from "vitest";
import { createDesktopSession, verifyDesktopSession } from "./desktop-session";

describe("desktop sessions", () => {
  it("round-trips the user and external-login state", async () => {
    const token = await createDesktopSession("user_owner", "secret", "state-123");
    await expect(verifyDesktopSession(token, "secret")).resolves.toMatchObject({ userId: "user_owner", state: "state-123" });
  });

  it("rejects a token signed with another secret", async () => {
    const token = await createDesktopSession("user_owner", "secret", "state-123");
    await expect(verifyDesktopSession(token, "other-secret")).resolves.toBeUndefined();
  });
});
