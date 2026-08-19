import { profile } from "./profiles";
import {
  DEFAULT_PROFILE_ID,
  type CampaignPlan,
  type EpitopeChoice,
  type MethodShare,
  type PlanInput,
  type ProfileId,
  type StructureMethodId,
  type TargetSpec,
} from "./types";

export class PlanLockError extends Error {
  readonly code = "PLAN_LOCK";

  constructor(readonly violations: string[]) {
    super(`Campaign plan violates locks: ${violations.join("; ")}`);
    this.name = "PlanLockError";
  }
}

const PRODUCT_DEFAULT_COUNTS: Record<StructureMethodId, number> = {
  rfdiffusion3: 7,
  freebindcraft: 6,
  boltzgen: 6,
  pxdesign: 6,
  genie: 5,
  bindcraft: 0,
  rfdiffusion: 0,
};

function asTarget(input?: string | TargetSpec): TargetSpec {
  if (!input) return { name: "unspecified-target" };
  if (typeof input === "string") return { name: input };
  if (!input.name.trim()) return { name: "unspecified-target" };
  return { ...input, name: input.name.trim() };
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "target";
}

function sharesFromCounts(
  counts: Partial<Record<StructureMethodId, number>>,
  designs: number,
): MethodShare[] {
  return (Object.entries(counts) as [StructureMethodId, number][])
    .filter(([, count]) => count > 0)
    .map(([method, count]) => ({
      method,
      count,
      share: designs === 0 ? 0 : count / designs,
    }))
    .sort((a, b) => b.count - a.count || a.method.localeCompare(b.method));
}

function lockViolations(
  profileId: ProfileId,
  locks: CampaignPlan["locks"],
  methods: MethodShare[],
  input: PlanInput,
): string[] {
  const violations: string[] = [];
  const total = methods.reduce((sum, item) => sum + item.count, 0);

  if (profileId === DEFAULT_PROFILE_ID) {
    if (input.designs !== undefined && input.designs !== locks.designs) {
      violations.push(`designs is locked to ${locks.designs}`);
    }
    if (
      input.length &&
      (input.length.min !== locks.length.min || input.length.max !== locks.length.max)
    ) {
      violations.push(`length is locked to ${locks.length.min}–${locks.length.max} aa`);
    }
  }

  if (total !== locks.designs) {
    violations.push(`ordered list must contain exactly ${locks.designs} designs (got ${total})`);
  }
  if (methods.length < locks.minStructureMethods) {
    violations.push(
      `ordered list must use at least ${locks.minStructureMethods} structure methods (got ${methods.length})`,
    );
  }
  for (const method of methods) {
    if (method.share > locks.maxMethodShare + Number.EPSILON) {
      violations.push(
        `${method.method} is ${Math.round(method.share * 100)}% of the ordered list; max is ${Math.round(locks.maxMethodShare * 100)}%`,
      );
    }
  }
  return violations;
}

export function plan(input: PlanInput = {}): CampaignPlan {
  const selected = profile(input.profile ?? DEFAULT_PROFILE_ID);
  const target = asTarget(input.target);
  const epitope: EpitopeChoice = input.epitope
    ? { ...input.epitope }
    : { status: "unspecified" };

  const counts = input.methods
    ? { ...input.methods }
    : selected.id === DEFAULT_PROFILE_ID
      ? { ...PRODUCT_DEFAULT_COUNTS }
      : Object.fromEntries(selected.defaultStructureMethods.map((method) => [method, selected.locks.designs]));

  const structureMethods = sharesFromCounts(counts, selected.locks.designs);
  const violations = lockViolations(selected.id, selected.locks, structureMethods, input);
  if (violations.length > 0) throw new PlanLockError(violations);

  return {
    id: `evebind-${selected.id}-${slug(target.name)}`,
    profileId: selected.id,
    product: selected.product,
    notTheProduct: selected.notTheProduct,
    target,
    epitope,
    locks: structuredClone(selected.locks),
    stages: [...selected.stages],
    structureMethods,
    sequenceMethods: [...selected.sequenceMethods],
    predictors: [...selected.predictors],
    ranking: structuredClone(selected.ranking),
    optimize: input.optimize === false ? "skipped" : input.optimize ? "requested" : "optional",
    deliverable: {
      designs: selected.locks.designs,
      provenance: true,
    },
    notes: [
      ...selected.notes,
      epitope.status === "unspecified"
        ? "No epitope was supplied. Research the target, then choose one."
        : `Epitope recorded as ${epitope.label ?? "chosen"}.`,
    ],
  };
}
