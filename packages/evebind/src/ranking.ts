import { POSE_SCORE_CAVEAT, type DesignScoreInput, type PredictorSeedScore, type RankScore, type RankedDesign } from "./types";

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function zScores(values: number[]): number[] {
  if (values.length === 0) return [];
  const mu = mean(values);
  const variance = mean(values.map((value) => (value - mu) ** 2));
  const std = Math.sqrt(variance);
  if (std === 0) return values.map(() => 0);
  return values.map((value) => (value - mu) / std);
}

export function maxSeedByPredictor(
  scores: PredictorSeedScore[],
  field: "ipSAEmin" | "scDockQ",
): Record<string, number> {
  const best: Record<string, number> = {};
  for (const row of scores) {
    const value = field === "ipSAEmin" ? row.ipSAEmin : row.scDockQ;
    if (value === undefined) continue;
    const previous = best[row.predictor];
    if (previous === undefined || value > previous) best[row.predictor] = value;
  }
  return best;
}

export function meanMaxSeedIpSAEmin(scores: PredictorSeedScore[]): number {
  return mean(Object.values(maxSeedByPredictor(scores, "ipSAEmin")));
}

export function meanMaxSeedScDockQ(scores: PredictorSeedScore[]): number | undefined {
  const maxima = Object.values(maxSeedByPredictor(scores, "scDockQ"));
  return maxima.length === 0 ? undefined : mean(maxima);
}

export function rankScore(scores: PredictorSeedScore[]): RankScore {
  const perPredictorMaxIpSAEmin = maxSeedByPredictor(scores, "ipSAEmin");
  const ipSAEminMean = mean(Object.values(perPredictorMaxIpSAEmin));
  const scDockQMean = meanMaxSeedScDockQ(scores);
  return {
    ipSAEminMean,
    scDockQMean,
    combined: ipSAEminMean,
    perPredictorMaxIpSAEmin,
    poseScoreIsNotBindCall: true,
    caveat: POSE_SCORE_CAVEAT,
  };
}

export function rankDesigns(designs: DesignScoreInput[]): RankedDesign[] {
  const cards = designs.map((design) => ({
    ...design,
    score: rankScore(design.scores),
  }));

  const primary = zScores(cards.map((card) => card.score.ipSAEminMean));
  const secondaryValues = cards.map((card) => card.score.scDockQMean);
  const hasSecondary = secondaryValues.some((value) => value !== undefined);
  const secondary = hasSecondary
    ? zScores(secondaryValues.map((value) => value ?? 0))
    : cards.map(() => 0);

  const ranked = cards
    .map((card, index) => ({
      ...card,
      score: {
        ...card.score,
        combined: primary[index] + 0.25 * secondary[index],
      },
    }))
    .sort((a, b) => {
      if (b.score.combined !== a.score.combined) return b.score.combined - a.score.combined;
      return b.score.ipSAEminMean - a.score.ipSAEminMean;
    });

  return ranked.map((card, index) => ({ ...card, rank: index + 1 }));
}
