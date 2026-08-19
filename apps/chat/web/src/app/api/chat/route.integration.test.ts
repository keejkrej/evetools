import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/owner-auth", () => ({
  authorizeOwner: vi.fn(async () => null),
}));

import { POST } from "./route";

const live =
  process.env.OPENAI_INTEGRATION === "1" &&
  !!process.env.OPENAI_API_KEY &&
  !!process.env.OPENAI_BASE_URL;

describe.skipIf(!live)("OpenAI-compatible chat integration", () => {
  it(
    "streams a real model response through the public event contract",
    async () => {
      const response = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `integration-${Date.now()}`,
          },
          body: JSON.stringify({
            model: "chatgpt/gpt-5.6-luna",
            messages: [
              {
                role: "user",
                content: "Reply with exactly the single word: hello",
              },
            ],
          }),
        }),
      );

      expect(response.status).toBe(200);
      const events = (await response.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { type: string; delta?: string });
      const text = events
        .filter((event) => event.type === "text")
        .map((event) => event.delta ?? "")
        .join("");

      expect(text.toLowerCase()).toContain("hello");
    },
    120_000,
  );
});
