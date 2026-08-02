import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeDesktopAuthentication,
  publishDesktopAuthentication,
  resetDesktopAuthenticationStore,
} from "./desktop-auth-store";

describe("desktop loopback authentication handoff", () => {
  beforeEach(resetDesktopAuthenticationStore);

  it("lets Electron consume the browser callback exactly once", () => {
    publishDesktopAuthentication("state-1", "token-1");

    expect(consumeDesktopAuthentication("state-1")).toBe("token-1");
    expect(consumeDesktopAuthentication("state-1")).toBeUndefined();
  });

  it("does not expose a token to another state", () => {
    publishDesktopAuthentication("state-1", "token-1");

    expect(consumeDesktopAuthentication("state-2")).toBeUndefined();
    expect(consumeDesktopAuthentication("state-1")).toBe("token-1");
  });
});
