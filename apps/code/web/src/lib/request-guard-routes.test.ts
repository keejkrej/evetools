import { describe, expect, it } from "vitest";
import { GET as getModels } from "../app/api/models/route";
import { GET as getWorkspace } from "../app/api/workspace/route";

const crossOriginHeaders = {
  "content-type": "application/json",
  origin: "https://attacker.example",
  "sec-fetch-site": "cross-site",
};

describe("Evecode API request guards", () => {
  it("rejects cross-origin reads before accessing provider data", async () => {
    const response = await getModels(
      new Request("http://127.0.0.1:3000/api/models", {
        headers: crossOriginHeaders,
      }),
    );

    expect(response.status).toBe(403);
  });

  it("rejects cross-origin workspace access before touching the filesystem", async () => {
    const response = await getWorkspace(
      new Request("http://127.0.0.1:3000/api/workspace", {
        headers: crossOriginHeaders,
      }),
    );

    expect(response.status).toBe(403);
  });
});
