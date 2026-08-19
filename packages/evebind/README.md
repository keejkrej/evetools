# @evetools/evebind

Evebind is a **protein-binder design orchestrator**. It plans a campaign, writes a
directory you can hand to GPU jobs, and ranks already-computed co-fold scores. It
is not a generative model.

It copies the Anthropic August 2026 Claude campaign architecture: research the
target → choose an epitope (none is given) → run multiple SOTA generators → cheap
filters → co-fold rank → optional optimize → 30 ranked designs plus provenance.

## What it is not

- It does **not** close the affinity gap. Co-fold pose scores are useful for
  ranking inside a target and are not bind/no-bind calls (MBP-like failures
  scored about as well as productive targets).
- It is **not** a BindClaw port. BindClaw was an OpenClaw plugin for the GEM ×
  Adaptyv RBX1 competition around BoltzGen/Boltz only.
- It is **not** “LLM writes residues.” Sequences come from BindCraft,
  RFdiffusion, BoltzGen, PXDesign, Genie, and SolubleMPNN — not from the
  language model.

Evebind does not execute GPUs and does not download weights.

## Public API

```ts
import { plan, prepare, profile, renderCommands } from "@evetools/evebind";

const defaults = profile(); // de-novo-miniprotein
const campaign = plan({ target: { name: "EGFR", uniprot: "P00533" } });
await prepare("./campaigns/egfr", campaign);
const commands = renderCommands(campaign);
```

| Function | Role |
| --- | --- |
| `profile()` | Default product profile, or `profile("gem-adaptyv-rbx1")` for the historical id |
| `plan(input)` | Locked campaign: 30 designs, 50–120 aa, ≥3 structure methods, no method >50% of the ordered list |
| `prepare(dir)` | Writes `protocol.md`, `campaign.plan.json`, `specs/`, submission template, `provenance.schema.json`, `notes/` |
| `renderCommands(plan)` | Command **templates** only |

`gem-adaptyv-rbx1` is marked **not-the-product**. It exists so that historical
campaign id still resolves.

## Ranking

```ts
import { rankDesigns } from "@evetools/evebind";

rankDesigns(designs);
```

Primary: mean of per-predictor max-seed **ipSAEmin**. Secondary: **sc-DockQ** at
one-quarter weight after within-set z-scoring. Screen with one seed; rank with
five. A high pose score is not evidence of binding.

## Command templates

Templates exist only for BindCraft/FreeBindCraft, RFdiffusion/RFdiffusion3,
BoltzGen, PXDesign, Genie, SolubleMPNN, and Boltz-2/Protenix/ESMFold2. Install
those tools yourself. Evebind will not fetch checkpoints or launch jobs.
