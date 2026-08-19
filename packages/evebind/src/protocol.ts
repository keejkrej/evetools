import type { CampaignPlan } from "./types";

export function protocolMarkdown(plan: CampaignPlan): string {
  return `# Evebind campaign protocol

Evebind is an orchestrator. It writes a campaign, command templates, and provenance
schema. It is not a generative model. It does not write residues, download weights,
or run GPUs. It does not close the affinity gap.

This protocol copies the **Anthropic August 2026 Claude campaign architecture**
(Shanehsazzadeh, *Autonomous de novo protein binder design with Claude*):

1. Research the target.
2. Choose an epitope (none is given).
3. Generate with multiple SOTA structure methods.
4. Apply cheap filters before expensive co-folds.
5. Rank by co-folding confidence.
6. Optionally optimize top candidates in silico.
7. Deliver ${plan.deliverable.designs} ranked designs plus provenance.

## Product locks

Profile: \`${plan.profileId}\`${plan.notTheProduct ? " (**not-the-product**)" : ""}

- Ordered list size: **${plan.locks.designs}**
- Length: **${plan.locks.length.min}–${plan.locks.length.max} aa**
- At least **${plan.locks.minStructureMethods}** structure methods in the ordered list
- No method may exceed **${Math.round(plan.locks.maxMethodShare * 100)}%** of the ordered list

The default product profile is \`de-novo-miniprotein\`. \`gem-adaptyv-rbx1\` is a
historical GEM × Adaptyv RBX1 competition id and is marked not-the-product.

## Target

- Name: ${plan.target.name}
- UniProt: ${plan.target.uniprot ?? "(research this)"}
- Organism: ${plan.target.organism ?? "(research this)"}
- Oligomeric state: ${plan.target.oligomericState ?? "(research this)"}

Start from the name / accession / organism / oligomer only. Build a short dossier:
biology, available structures, natural partners, assayable construct, and surfaces
where a miniprotein could matter.

## Epitope

${
  plan.epitope.status === "unspecified"
    ? "No epitope was supplied. Choose one after research. Prefer surfaces used by natural partners when a complex exists, and allow a novel epitope only with a written justification."
    : `Recorded epitope: ${plan.epitope.label ?? "chosen"}${plan.epitope.justification ? ` — ${plan.epitope.justification}` : ""}`
}

## Generation

Use multiple open-source structure methods. Evebind templates commands only for:

- BindCraft / FreeBindCraft
- RFdiffusion / RFdiffusion3
- BoltzGen
- PXDesign
- Genie
- SolubleMPNN (sequence)
- Boltz-2 / Protenix / ESMFold2 (co-fold)

Default sequence design is SolubleMPNN unless the generator already emits a sequence.
Do not ask an LLM to invent amino-acid strings.

## Cheap filters

Before spending co-fold compute, drop candidates that:

- match UniRef90 or published binder corpora too closely
- duplicate one another in sequence or fold
- have pathological composition (excessive cysteine, low complexity, long hydrophobic stretches)

These screens are documented, not executed, by evebind.

## Ranking

Primary score: **mean of per-predictor max-seed ipSAEmin**.

For each design and each predictor, keep the seed with the highest ipSAEmin. Average
those maxima. Screen with one seed per predictor; rank the shortlist with five seeds.

Secondary score: **sc-DockQ** (DockQ between the predicted complex and the designed
pose), at one-quarter weight after within-target z-scoring. It checks that the
predicted pose is the designed one. It is a weaker filter.

${plan.ranking.caveat}

## Optimization

In-silico optimization is optional: partial diffusion plus redesign, inverse-folding
resampling, predict-and-redesign cycles, or point mutants on the top-scoring pool.
Skip it when it would not change the ordered 30.

## Deliverable

Return exactly ${plan.deliverable.designs} ranked sequences with per-design provenance
(method, epitope, filters, seeds, scores). Synthesis lists must match the ranked
order. Evebind does not place orders.

## What this is not

- Not a BindClaw port. BindClaw was an OpenClaw plugin for one RBX1 competition
  around BoltzGen/Boltz.
- Not “LLM writes residues.”
- Not a claim that high pose scores bind, or that this stack closes affinity.
`;
}

export function stageSpecs(plan: CampaignPlan): Record<string, string> {
  return {
    "research.md": `# Research

Target: ${plan.target.name}

Collect a dossier from public literature and structures. Record UniProt, organism,
oligomeric state, cofactors, and an assayable construct. Evebind does not fetch
papers or structures.
`,
    "epitope.md": `# Epitope

${
  plan.epitope.status === "unspecified"
    ? "None given. Choose after research. Prefer natural-partner surfaces when a complex exists."
    : `Chosen: ${plan.epitope.label ?? "named epitope"}.`
}

Write the residue set and a one-paragraph justification before generating.
`,
    "generate.md": `# Generate

Ordered-list allocations (must satisfy product locks):

${plan.structureMethods.map((item) => `- ${item.method}: ${item.count} (${Math.round(item.share * 100)}%)`).join("\n")}

Length window: ${plan.locks.length.min}–${plan.locks.length.max} aa.
Sequence method: ${plan.sequenceMethods.join(", ")}.
`,
    "filter.md": `# Cheap filters

Apply novelty (MMseqs2 / UniRef90 + published binders), redundancy (sequence and
Foldseek/TM-align), and composition filters before co-fold ranking. Evebind does
not ship command templates for these tools.
`,
    "cofold.md": `# Co-fold rank

Predictors: ${plan.predictors.join(", ")}.

- Screen: ${plan.ranking.screeningSeeds} seed per predictor
- Final rank: ${plan.ranking.rankingSeeds} seeds per predictor
- Primary: mean of per-predictor max-seed ipSAEmin
- Secondary: sc-DockQ at weight ${plan.ranking.secondaryWeight}

${plan.ranking.caveat}
`,
    "optimize.md": `# Optimize (optional)

Status: ${plan.optimize}.

Allowed families: partial diffusion + redesign, SolubleMPNN resampling,
predict-and-redesign, point mutagenesis. Re-score with the same ranking helper.
`,
    "deliver.md": `# Deliver

Emit ${plan.deliverable.designs} ranked designs and fill provenance against
\`provenance.schema.json\`. Keep the ordered-list method mix legal. Do not edit
sequences after ranking to “improve” them by hand or by LLM.
`,
  };
}

export function notes(plan: CampaignPlan): Record<string, string> {
  return {
    "ranking.md": `# Ranking notes

Primary metric: mean of per-predictor max-seed ipSAEmin.
Secondary metric: sc-DockQ at 1/4 weight after within-set z-scoring.

${plan.ranking.caveat}

The Anthropic August 2026 campaigns also found that median pose scores rose with
hit rate across targets, but not steeply enough to flag failures. Among binders,
score vs KD was weak.
`,
    "limitations.md": `# Limitations

- Evebind is an orchestrator. It does not generate, fold, or assay proteins.
- It does not close the affinity gap.
- It is not a BindClaw port and not an LLM sequence designer.
- Command templates cover only BindCraft/FreeBindCraft, RFdiffusion/RFdiffusion3,
  BoltzGen, PXDesign, Genie, SolubleMPNN, and Boltz-2/Protenix/ESMFold2.
- No GPU execution. No weight downloads.
`,
    "gem-adaptyv-rbx1.md": `# gem-adaptyv-rbx1

This id is historical (GEM × Adaptyv RBX1 competition) and is marked
**not-the-product**. The product profile is \`de-novo-miniprotein\`.

Current plan profile: \`${plan.profileId}\` (product=${plan.product}).
`,
  };
}

export const SUBMISSION_TEMPLATE = `rank,id,sequence,length,structure_method,sequence_method,epitope,ipSAEmin_mean,scDockQ_mean,rank_score,notes
1,,,,,,,,
2,,,,,,,,
3,,,,,,,,
`;

export const PROVENANCE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://evetools.dev/evebind/provenance.schema.json",
  title: "Evebind design provenance",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "rank",
    "sequence",
    "length",
    "target",
    "epitope",
    "structureMethod",
    "sequenceMethod",
    "filters",
    "scores",
    "optimizationRounds",
  ],
  properties: {
    id: { type: "string" },
    rank: { type: "integer", minimum: 1, maximum: 30 },
    sequence: { type: "string", pattern: "^[ACDEFGHIKLMNPQRSTVWY]+$" },
    length: { type: "integer", minimum: 50, maximum: 120 },
    target: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        uniprot: { type: "string" },
        organism: { type: "string" },
        oligomericState: { type: "string" },
      },
    },
    epitope: {
      type: "object",
      required: ["status"],
      properties: {
        status: { enum: ["unspecified", "chosen"] },
        label: { type: "string" },
        justification: { type: "string" },
        residues: { type: "array", items: { type: "integer" } },
      },
    },
    structureMethod: {
      enum: [
        "bindcraft",
        "freebindcraft",
        "rfdiffusion",
        "rfdiffusion3",
        "boltzgen",
        "pxdesign",
        "genie",
      ],
    },
    sequenceMethod: { enum: ["soluble-mpnn", "generator-joint"] },
    filters: {
      type: "object",
      properties: {
        noveltyPassed: { type: "boolean" },
        redundancyPassed: { type: "boolean" },
        compositionPassed: { type: "boolean" },
      },
    },
    scores: {
      type: "object",
      required: ["ipSAEminMean"],
      properties: {
        ipSAEminMean: { type: "number" },
        scDockQMean: { type: "number" },
        combined: { type: "number" },
        perPredictorMaxIpSAEmin: {
          type: "object",
          additionalProperties: { type: "number" },
        },
        poseScoreIsNotBindCall: { const: true },
      },
    },
    seeds: {
      type: "array",
      items: {
        type: "object",
        required: ["predictor", "seed", "ipSAEmin"],
        properties: {
          predictor: { type: "string" },
          seed: { type: "integer" },
          ipSAEmin: { type: "number" },
          scDockQ: { type: "number" },
        },
      },
    },
    optimizationRounds: { type: "integer", minimum: 0 },
    notes: { type: "string" },
  },
} as const;
