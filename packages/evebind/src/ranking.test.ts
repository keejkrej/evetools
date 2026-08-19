import { describe, expect, it } from "vitest";
import { meanMaxSeedIpSAEmin, rankDesigns, rankScore } from "./ranking";
import { POSE_SCORE_CAVEAT } from "./types";

describe("ranking helper", () => {
  it("takes the max seed per predictor, then the mean of those maxima", () => {
    const mean = meanMaxSeedIpSAEmin([
      { predictor: "esmfold2", seed: 0, ipSAEmin: 0.4 },
      { predictor: "esmfold2", seed: 1, ipSAEmin: 0.9 },
      { predictor: "protenix", seed: 0, ipSAEmin: 0.5 },
      { predictor: "protenix", seed: 1, ipSAEmin: 0.7 },
      { predictor: "boltz-2", seed: 0, ipSAEmin: 0.8 },
    ]);
    expect(mean).toBeCloseTo((0.9 + 0.7 + 0.8) / 3);
  });

  it("treats sc-DockQ as a weaker secondary term", () => {
    const ranked = rankDesigns([
      {
        id: "high-ipsae",
        scores: [
          { predictor: "esmfold2", seed: 0, ipSAEmin: 0.9, scDockQ: 0.1 },
          { predictor: "protenix", seed: 0, ipSAEmin: 0.9, scDockQ: 0.1 },
        ],
      },
      {
        id: "high-scdockq",
        scores: [
          { predictor: "esmfold2", seed: 0, ipSAEmin: 0.2, scDockQ: 0.95 },
          { predictor: "protenix", seed: 0, ipSAEmin: 0.2, scDockQ: 0.95 },
        ],
      },
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["high-ipsae", "high-scdockq"]);
    expect(ranked[0].score.ipSAEminMean).toBeGreaterThan(ranked[1].score.ipSAEminMean);
    expect(ranked[1].score.scDockQMean ?? 0).toBeGreaterThan(ranked[0].score.scDockQMean ?? 0);
  });

  it("documents that a pose score is not a bind/no-bind call", () => {
    const score = rankScore([{ predictor: "esmfold2", seed: 0, ipSAEmin: 0.7 }]);
    expect(score.poseScoreIsNotBindCall).toBe(true);
    expect(score.caveat).toBe(POSE_SCORE_CAVEAT);
    expect(score.caveat).toMatch(/MBP/);
  });
});
