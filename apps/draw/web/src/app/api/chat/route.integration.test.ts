import { describe, expect, it } from "vitest";
import { POST } from "./route";

const live = process.env.CURSOR_INTEGRATION === "1" && !!process.env.CURSOR_API_KEY;

describe.skipIf(!live)("Cursor chat integration", () => {
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
            model: "auto",
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
