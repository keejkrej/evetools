import { describe, expect, it } from "vitest";
import { plan, PlanLockError } from "./plan";
import { profile } from "./profiles";

describe("plan locks", () => {
  it("defaults to de-novo-miniprotein with product locks satisfied", () => {
    const campaign = plan({ target: "EGFR" });
    expect(campaign.profileId).toBe("de-novo-miniprotein");
    expect(campaign.product).toBe(true);
    expect(campaign.notTheProduct).toBe(false);
    expect(campaign.deliverable.designs).toBe(30);
    expect(campaign.locks).toEqual({
      designs: 30,
      length: { min: 50, max: 120 },
      minStructureMethods: 3,
      maxMethodShare: 0.5,
    });
    expect(campaign.epitope.status).toBe("unspecified");
    expect(campaign.structureMethods).toHaveLength(5);
    const total = campaign.structureMethods.reduce((sum, item) => sum + item.count, 0);
    expect(total).toBe(30);
    expect(Math.max(...campaign.structureMethods.map((item) => item.share))).toBeLessThanOrEqual(0.5);
  });

  it("rejects overriding locked design count or length", () => {
    expect(() => plan({ designs: 50 })).toThrow(PlanLockError);
    expect(() => plan({ length: { min: 40, max: 200 } })).toThrow(PlanLockError);
  });

  it("requires at least three structure methods on the ordered list", () => {
    expect(() =>
      plan({
        methods: { rfdiffusion3: 15, boltzgen: 15, pxdesign: 0, genie: 0, freebindcraft: 0 },
      }),
    ).toThrow(/at least 3 structure methods/);
  });

  it("rejects any method above 50% of the ordered list", () => {
    expect(() =>
      plan({
        methods: { rfdiffusion3: 16, boltzgen: 7, pxdesign: 7 },
      }),
    ).toThrow(/rfdiffusion3 is 53% of the ordered list/);
  });

  it("accepts a legal three-method mix", () => {
    const campaign = plan({
      methods: { rfdiffusion3: 12, boltzgen: 10, pxdesign: 8 },
    });
    expect(campaign.structureMethods.map((item) => item.method)).toEqual([
      "rfdiffusion3",
      "boltzgen",
      "pxdesign",
    ]);
  });

  it("marks gem-adaptyv-rbx1 as not-the-product", () => {
    const historical = profile("gem-adaptyv-rbx1");
    expect(historical.product).toBe(false);
    expect(historical.notTheProduct).toBe(true);
    expect(profile().id).toBe("de-novo-miniprotein");

    const campaign = plan({ profile: "gem-adaptyv-rbx1", target: "RBX1" });
    expect(campaign.notTheProduct).toBe(true);
    expect(campaign.product).toBe(false);
    expect(campaign.profileId).toBe("gem-adaptyv-rbx1");
  });
});
