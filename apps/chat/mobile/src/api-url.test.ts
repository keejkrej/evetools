import { describe, expect, it } from "vitest";

import { normalizeApiUrl } from "./api-url";

describe("mobile API URL", () => {
  it("normalizes a secure release URL", () => {
    expect(normalizeApiUrl(" https://chat.example.com/// ", false)).toBe(
      "https://chat.example.com",
    );
  });

  it("rejects cleartext HTTP for release builds", () => {
    expect(normalizeApiUrl("http://chat.example.com", false)).toBeNull();
  });

  it("allows a reachable HTTP LAN address during local development", () => {
    expect(normalizeApiUrl("http://192.168.1.25:3000/", true)).toBe(
      "http://192.168.1.25:3000",
    );
  });

  it("rejects malformed and credential-bearing values", () => {
    expect(normalizeApiUrl("not a URL", true)).toBeNull();
    expect(
      normalizeApiUrl("https://owner:secret@chat.example.com", true),
    ).toBeNull();
  });
});
