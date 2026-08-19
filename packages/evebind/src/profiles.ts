import {
  DEFAULT_PROFILE_ID,
  HISTORICAL_PROFILE_ID,
  POSE_SCORE_CAVEAT,
  PRODUCT_STAGES,
  type CampaignProfile,
  type ProfileId,
  type RankingPolicy,
} from "./types";

const ranking = (predictors: RankingPolicy["predictors"]): RankingPolicy => ({
  primary: "mean-of-per-predictor-max-seed-ipSAEmin",
  secondary: "sc-DockQ",
  secondaryWeight: 0.25,
  screeningSeeds: 1,
  rankingSeeds: 5,
  predictors,
  poseScoreIsNotBindCall: true,
  caveat: POSE_SCORE_CAVEAT,
});

const DE_NOVO_MINIPROTEIN: CampaignProfile = {
  id: DEFAULT_PROFILE_ID,
  title: "De novo miniprotein binder campaign",
  product: true,
  notTheProduct: false,
  summary:
    "Default evebind product: research a named target, choose an epitope (none is given), generate with multiple SOTA structure methods, cheap-filter, co-fold rank, optionally optimize, and deliver 30 ranked 50–120 aa designs with provenance.",
  locks: {
    designs: 30,
    length: { min: 50, max: 120 },
    minStructureMethods: 3,
    maxMethodShare: 0.5,
  },
  stages: PRODUCT_STAGES,
  defaultStructureMethods: ["rfdiffusion3", "freebindcraft", "boltzgen", "pxdesign", "genie"],
  sequenceMethods: ["soluble-mpnn"],
  predictors: ["esmfold2", "protenix", "boltz-2"],
  ranking: ranking(["esmfold2", "protenix", "boltz-2"]),
  optimize: "optional",
  notes: [
    "Orchestrator only. Evebind does not generate residues, download weights, or run GPUs.",
    "Epitope is not preset. The campaign must choose one after target research.",
    "Ordered list must use at least three structure methods; no method may exceed 50% of the 30 designs.",
    POSE_SCORE_CAVEAT,
    "Does not close the affinity gap. Co-fold confidence is only weakly related to KD.",
  ],
};

const GEM_ADAPTYV_RBX1: CampaignProfile = {
  id: HISTORICAL_PROFILE_ID,
  title: "GEM × Adaptyv RBX1 (historical, not the product)",
  product: false,
  notTheProduct: true,
  summary:
    "Historical GEM × Adaptyv RBX1 competition record. Kept so older campaign IDs resolve. This is not the evebind product and must not be treated as the default binder-design protocol.",
  locks: {
    designs: 100,
    length: { min: 1, max: 250 },
    minStructureMethods: 1,
    maxMethodShare: 1,
  },
  stages: PRODUCT_STAGES,
  defaultStructureMethods: ["boltzgen"],
  sequenceMethods: ["soluble-mpnn"],
  predictors: ["boltz-2"],
  ranking: ranking(["boltz-2"]),
  optimize: "optional",
  notes: [
    "not-the-product: gem-adaptyv-rbx1 is a historical competition profile, not the evebind product.",
    "The product profile is de-novo-miniprotein (30 designs, 50–120 aa, multi-method SOTA, Anthropic August 2026 campaign architecture).",
    "Not a BindClaw port. BindClaw was an OpenClaw RBX1 helper around BoltzGen/Boltz only.",
  ],
};

const PROFILES: Record<ProfileId, CampaignProfile> = {
  [DEFAULT_PROFILE_ID]: DE_NOVO_MINIPROTEIN,
  [HISTORICAL_PROFILE_ID]: GEM_ADAPTYV_RBX1,
};

export function profile(id: ProfileId = DEFAULT_PROFILE_ID): CampaignProfile {
  const resolved = PROFILES[id];
  if (!resolved) {
    throw new Error(`Unknown evebind profile: ${String(id)}`);
  }
  return structuredClone(resolved);
}

export function listProfiles(): CampaignProfile[] {
  return Object.values(PROFILES).map((item) => structuredClone(item));
}
