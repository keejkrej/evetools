import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  publishDesktopAuthentication,
  resetDesktopAuthenticationStore,
} from "@/lib/desktop-auth-store";
import { GET } from "./route";

describe("desktop authentication status route", () => {
  beforeEach(resetDesktopAuthenticationStore);

  it("returns no content while browser authentication is pending", async () => {
    const response = await GET(
      new NextRequest("http://127.0.0.1:43117/desktop-auth/status?state=pending"),
    );

    expect(response.status).toBe(204);
  });

  it("delivers the matching callback token once", async () => {
    publishDesktopAuthentication("ready", "signed-token");
    const request = new NextRequest(
      "http://127.0.0.1:43117/desktop-auth/status?state=ready",
    );

    const response = await GET(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ token: "signed-token" });
    expect((await GET(request)).status).toBe(204);
  });
});
