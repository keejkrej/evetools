import { describe, expect, it } from "vitest";
import {
  enforceLocalRequest,
  isLocalSameOriginRequest,
} from "./request-guard";

function request(
  url = "http://127.0.0.1:3000/api/workspace",
  headers: Record<string, string> = {},
) {
  return new Request(url, { headers });
}

describe("Evecode local request guard", () => {
  it("allows loopback CLI and test requests without an Origin", () => {
    expect(isLocalSameOriginRequest(request())).toBe(true);
    expect(isLocalSameOriginRequest(request("http://localhost:3000/api/models"))).toBe(true);
    expect(enforceLocalRequest(request())).toBeNull();
  });

  it("allows exact same-origin browser requests", () => {
    const sameOrigin = request(undefined, {
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    });
    expect(isLocalSameOriginRequest(sameOrigin)).toBe(true);
  });

  it("allows Next's internal localhost URL for a 127.0.0.1 browser Host", () => {
    expect(isLocalSameOriginRequest(request("http://localhost:3000/api/workspace", {
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
      "x-forwarded-host": "127.0.0.1:3000",
    }))).toBe(true);
  });

  it.each([
    ["cross-origin", request(undefined, { origin: "https://example.com" })],
    ["wrong port", request(undefined, { origin: "http://127.0.0.1:4000" })],
    [
      "internally normalized URL with a different Host port",
      request("http://localhost:3000/api/workspace", { host: "127.0.0.1:4000" }),
    ],
    ["non-loopback URL", request("http://evecode.example/api/workspace")],
    [
      "DNS rebinding",
      request("http://attacker.example/api/workspace", {
        host: "attacker.example",
        origin: "http://attacker.example",
      }),
    ],
    [
      "spoofed forwarded host",
      request(undefined, {
        host: "attacker.example",
        "x-forwarded-host": "127.0.0.1:3000",
      }),
    ],
    [
      "foreign forwarded host",
      request(undefined, {
        host: "127.0.0.1:3000",
        "x-forwarded-host": "attacker.example:3000",
      }),
    ],
    [
      "cross-site Fetch Metadata",
      request(undefined, { "sec-fetch-site": "cross-site" }),
    ],
  ])("rejects %s requests", (_name, value) => {
    expect(isLocalSameOriginRequest(value)).toBe(false);
    expect(enforceLocalRequest(value)?.status).toBe(403);
  });
});
