export const DEFAULT_PROFILE_ID = "de-novo-miniprotein";
export const HISTORICAL_PROFILE_ID = "gem-adaptyv-rbx1";

export type ProfileId = typeof DEFAULT_PROFILE_ID | typeof HISTORICAL_PROFILE_ID;

export type CampaignStage =
  | "research"
  | "epitope"
  | "generate"
  | "filter"
  | "cofold"
  | "optimize"
  | "deliver";

export type StructureMethodId =
  | "bindcraft"
  | "freebindcraft"
  | "rfdiffusion"
  | "rfdiffusion3"
  | "boltzgen"
  | "pxdesign"
  | "genie";

export type SequenceMethodId = "soluble-mpnn";

export type PredictorId = "boltz-2" | "protenix" | "esmfold2";

export type ToolId = StructureMethodId | SequenceMethodId | PredictorId;

export type TargetSpec = {
  name: string;
  uniprot?: string;
  organism?: string;
  oligomericState?: string;
};

export type EpitopeChoice = {
  status: "unspecified" | "chosen";
  label?: string;
  justification?: string;
  residues?: number[];
};

export type LengthRange = {
  min: number;
  max: number;
};

export type PlanLocks = {
  designs: number;
  length: LengthRange;
  minStructureMethods: number;
  maxMethodShare: number;
};

export type MethodShare = {
  method: StructureMethodId;
  count: number;
  share: number;
};

export type RankingPolicy = {
  primary: "mean-of-per-predictor-max-seed-ipSAEmin";
  secondary: "sc-DockQ";
  secondaryWeight: 0.25;
  screeningSeeds: 1;
  rankingSeeds: 5;
  predictors: PredictorId[];
  poseScoreIsNotBindCall: true;
  caveat: string;
};

export type CampaignProfile = {
  id: ProfileId;
  title: string;
  product: boolean;
  notTheProduct: boolean;
  summary: string;
  locks: PlanLocks;
  stages: CampaignStage[];
  defaultStructureMethods: StructureMethodId[];
  sequenceMethods: SequenceMethodId[];
  predictors: PredictorId[];
  ranking: RankingPolicy;
  optimize: "optional";
  notes: string[];
};

export type PlanInput = {
  profile?: ProfileId;
  target?: string | TargetSpec;
  epitope?: EpitopeChoice | null;
  methods?: Partial<Record<StructureMethodId, number>>;
  length?: LengthRange;
  designs?: number;
  optimize?: boolean;
};

export type CampaignPlan = {
  id: string;
  profileId: ProfileId;
  product: boolean;
  notTheProduct: boolean;
  target: TargetSpec;
  epitope: EpitopeChoice;
  locks: PlanLocks;
  stages: CampaignStage[];
  structureMethods: MethodShare[];
  sequenceMethods: SequenceMethodId[];
  predictors: PredictorId[];
  ranking: RankingPolicy;
  optimize: "optional" | "requested" | "skipped";
  deliverable: {
    designs: number;
    provenance: true;
  };
  notes: string[];
};

export type PredictorSeedScore = {
  predictor: string;
  seed: number;
  ipSAEmin: number;
  scDockQ?: number;
};

export type DesignScoreInput = {
  id: string;
  scores: PredictorSeedScore[];
};

export type RankScore = {
  ipSAEminMean: number;
  scDockQMean?: number;
  combined: number;
  perPredictorMaxIpSAEmin: Record<string, number>;
  poseScoreIsNotBindCall: true;
  caveat: string;
};

export type RankedDesign = DesignScoreInput & {
  rank: number;
  score: RankScore;
};

export type RenderedCommand = {
  id: string;
  tool: ToolId;
  stage: CampaignStage;
  argv: string[];
  placeholders: string[];
  executesGpu: false;
  downloadsWeights: false;
  notes: string;
};

export type PreparedCampaign = {
  dir: string;
  plan: CampaignPlan;
  files: string[];
};

export const POSE_SCORE_CAVEAT =
  "A high co-fold pose score is not a bind/no-bind classifier. In the Anthropic August 2026 campaigns, MBP designs scored similarly to productive targets and still produced no binders. Experimental screening is required.";

export const PRODUCT_STAGES: CampaignStage[] = [
  "research",
  "epitope",
  "generate",
  "filter",
  "cofold",
  "optimize",
  "deliver",
];
