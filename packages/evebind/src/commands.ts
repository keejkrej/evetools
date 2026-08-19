import type { CampaignPlan, PredictorId, RenderedCommand, StructureMethodId, ToolId } from "./types";

const PLACEHOLDER = /\{[a-z0-9_]+\}/g;

function command(
  id: string,
  tool: ToolId,
  stage: RenderedCommand["stage"],
  argv: string[],
  notes: string,
): RenderedCommand {
  return {
    id,
    tool,
    stage,
    argv,
    placeholders: [...new Set(argv.flatMap((part) => part.match(PLACEHOLDER) ?? []))],
    executesGpu: false,
    downloadsWeights: false,
    notes: `${notes} Template only. Evebind does not execute GPUs or fetch weights.`,
  };
}

const GENERATOR_TEMPLATES: Record<StructureMethodId, (count: number) => RenderedCommand> = {
  bindcraft: (count) =>
    command(
      "generate-bindcraft",
      "bindcraft",
      "generate",
      [
        "python",
        "-u",
        "bindcraft.py",
        "--settings",
        "{settings_json}",
        "--filters",
        "{filters_json}",
        "--advanced",
        "{advanced_json}",
      ],
      `BindCraft hallucination + MPNN. Request about ${count} backbones toward the ordered-list allocation. Install from the BindCraft public repository.`,
    ),
  freebindcraft: (count) =>
    command(
      "generate-freebindcraft",
      "freebindcraft",
      "generate",
      [
        "python",
        "-u",
        "bindcraft.py",
        "--settings",
        "{settings_json}",
        "--filters",
        "{filters_json}",
        "--advanced",
        "{advanced_json}",
        "--no-pyrosetta",
      ],
      `FreeBindCraft is BindCraft with the PyRosetta bypass. Request about ${count} backbones toward the ordered-list allocation.`,
    ),
  rfdiffusion: (count) =>
    command(
      "generate-rfdiffusion",
      "rfdiffusion",
      "generate",
      [
        "python",
        "scripts/run_inference.py",
        "inference.output_prefix={output_prefix}",
        "inference.input_pdb={target_pdb}",
        "contigmap.contigs=[{contigs}]",
        `inference.num_designs=${count}`,
      ],
      "RFdiffusion binder contig inference. Contigs and hotspot residues are campaign choices after epitope selection.",
    ),
  rfdiffusion3: (count) =>
    command(
      "generate-rfdiffusion3",
      "rfdiffusion3",
      "generate",
      [
        "rfdiffusion3",
        "infer",
        "--input_pdb",
        "{target_pdb}",
        "--contigs",
        "{contigs}",
        "--num_designs",
        String(count),
        "--out",
        "{output_dir}",
      ],
      "RFdiffusion3 all-atom binder inference. Confirm the current public CLI in the RFdiffusion3 repository before running.",
    ),
  boltzgen: (count) =>
    command(
      "generate-boltzgen",
      "boltzgen",
      "generate",
      ["boltzgen", "run", "{spec_yaml}", "--protocol", "protein-anything"],
      `BoltzGen all-atom binder generation. Size the spec to about ${count} designs for this method's ordered-list share.`,
    ),
  pxdesign: (count) =>
    command(
      "generate-pxdesign",
      "pxdesign",
      "generate",
      [
        "pxdesign",
        "generate",
        "--target",
        "{target_pdb}",
        "--length",
        "{length_min}-{length_max}",
        "--num_designs",
        String(count),
        "--out",
        "{output_dir}",
      ],
      "PXDesign diffusion binder generation (Protenix team). Confirm flags against the public PXDesign repository.",
    ),
  genie: (count) =>
    command(
      "generate-genie",
      "genie",
      "generate",
      ["genie3", "run", "-c", "{experiment_yaml}"],
      `Genie 3 structure generation. Point the experiment YAML at about ${count} 50–120 aa binder backbones.`,
    ),
};

function sequenceCommand(): RenderedCommand {
  return command(
    "sequence-soluble-mpnn",
    "soluble-mpnn",
    "generate",
    [
      "python",
      "protein_mpnn_run.py",
      "--pdb_path",
      "{backbone_pdb}",
      "--out_folder",
      "{output_dir}",
      "--num_seq_per_target",
      "{sequences_per_backbone}",
      "--use_soluble_model",
    ],
    "SolubleMPNN inverse folding on generated backbones. Skip for generators that already emit a sequence (some BindCraft/BoltzGen modes).",
  );
}

function predictorCommands(predictor: PredictorId, seeds: 1 | 5, stage: "filter" | "cofold"): RenderedCommand {
  const suffix = seeds === 1 ? "screen" : "rank";
  if (predictor === "boltz-2") {
    return command(
      `cofold-boltz-2-${suffix}`,
      "boltz-2",
      stage,
      [
        "boltz",
        "predict",
        "{complex_input}",
        "--out_dir",
        "{output_dir}",
        "--diffusion_samples",
        String(seeds),
      ],
      `${seeds === 1 ? "Screening" : "Final ranking"} with Boltz-2. Score each seed by ipSAEmin; keep the max seed per design.`,
    );
  }
  if (predictor === "protenix") {
    return command(
      `cofold-protenix-${suffix}`,
      "protenix",
      stage,
      [
        "protenix",
        "pred",
        "--input",
        "{complex_input}",
        "--out_dir",
        "{output_dir}",
        "--seeds",
        String(seeds),
      ],
      `${seeds === 1 ? "Screening" : "Final ranking"} with Protenix. Take max-seed ipSAEmin; sc-DockQ is a weaker secondary check against the designed pose.`,
    );
  }
  return command(
    `cofold-esmfold2-${suffix}`,
    "esmfold2",
    stage,
    [
      "python",
      "-m",
      "esmfold2",
      "predict",
      "--fasta",
      "{complex_fasta}",
      "--out",
      "{output_dir}",
      "--num-seeds",
      String(seeds),
    ],
    `${seeds === 1 ? "Screening" : "Final ranking"} with ESMFold2. Mean the per-predictor max-seed ipSAEmin values; do not treat the pose score as a bind call.`,
  );
}

export function renderCommands(plan: CampaignPlan): RenderedCommand[] {
  const commands: RenderedCommand[] = [];
  for (const share of plan.structureMethods) {
    commands.push(GENERATOR_TEMPLATES[share.method](share.count));
  }
  if (plan.sequenceMethods.includes("soluble-mpnn")) commands.push(sequenceCommand());
  for (const predictor of plan.predictors) {
    commands.push(predictorCommands(predictor, plan.ranking.screeningSeeds, "filter"));
    commands.push(predictorCommands(predictor, plan.ranking.rankingSeeds, "cofold"));
  }
  return commands;
}
