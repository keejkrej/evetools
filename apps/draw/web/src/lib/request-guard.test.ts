import { describe, expect, it } from "vitest";
import {
  acquireRequestSlot,
  hasAllowedOrigin,
} from "./request-guard";

function request(headers: Record<string, string>) {
  return new Request("https://eve.example/api/chat", { headers });
}

describe("request guard", () => {
  it("accepts same-origin browser and originless native requests", () => {
    expect(
      hasAllowedOrigin(
        request({
          host: "eve.example",
          origin: "https://eve.example",
        }),
      ),
    ).toBe(true);
    expect(hasAllowedOrigin(request({ host: "eve.example" }))).toBe(true);
  });

  it("rejects cross-origin browser requests", () => {
    expect(
      hasAllowedOrigin(
        request({
          host: "eve.example",
          origin: "https://attacker.example",
        }),
      ),
    ).toBe(false);
  });

  it("limits concurrent requests per client", () => {
    const guarded = request({ "x-forwarded-for": "guard-concurrency" });
    const slots = [
      acquireRequestSlot(guarded),
      acquireRequestSlot(guarded),
      acquireRequestSlot(guarded),
    ];
    expect(slots.every((slot) => slot.allowed)).toBe(true);
    expect(acquireRequestSlot(guarded).allowed).toBe(false);
    for (const slot of slots) {
      if (slot.allowed) slot.release();
    }
  });

  it("limits request volume per window", () => {
    const guarded = request({ "x-forwarded-for": "guard-volume" });
    for (let index = 0; index < 20; index += 1) {
      const slot = acquireRequestSlot(guarded);
      expect(slot.allowed).toBe(true);
      if (slot.allowed) slot.release();
    }
    expect(acquireRequestSlot(guarded).allowed).toBe(false);
  });
});
