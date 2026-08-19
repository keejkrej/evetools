import { defineAgent, defineDynamic } from "eve";
import {
  resolveModel,
  resolveModelId,
} from "../src/models/providers.js";

const reasoningLevels = [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;
type ReasoningLevel = (typeof reasoningLevels)[number];

function isReasoningLevel(value: string | undefined): value is ReasoningLevel {
  return reasoningLevels.some((level) => level === value);
}

const reasoningOverride = process.env.EVECODE_TUI_REASONING_OVERRIDE;
const reasoning = isReasoningLevel(reasoningOverride) ? reasoningOverride : "high";
const fallbackModel = process.env.EVECODE_TUI_MODEL_OVERRIDE;

export default defineAgent({
  model: defineDynamic({
    events: {
      "step.started": (_event, ctx) => resolveModel(
        resolveModelId(ctx.messages, fallbackModel),
      ),
    },
  }),
  reasoning,
  compaction: { thresholdPercent: 0.75 },
});
