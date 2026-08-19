export const DEFAULT_MODEL = "grok/grok-code";

export const MODELS = [
  "chatgpt/gpt-5.6-luna",
  "chatgpt/gpt-5.6-terra",
  "chatgpt/gpt-5.6-sol",
  "chatgpt/gpt-5.6",
  "chatgpt/gpt-5.5",
  "grok/grok-4.6",
  "grok/grok-4.5",
  "grok/grok-4",
  "grok/grok-code",
  "cursor/composer-2.5",
  "cursor/composer-2",
  "cursor/auto",
];

function aliasedModel(value) {
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return value;
  const provider = value.slice(0, slash);
  const modelId = value.slice(slash + 1);
  if (provider === "openai") return `chatgpt/${modelId}`;
  if (provider === "xai" || provider === "x-ai") return `grok/${modelId}`;
  return value;
}

export function normalizeModel(value, { legacyFallback = false } = {}) {
  if (!value || value === "gateway") return DEFAULT_MODEL;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) {
    if (legacyFallback) return DEFAULT_MODEL;
    throw new Error(`Invalid model ID ${value}; expected provider/model-id`);
  }
  const candidate = aliasedModel(value);
  if (MODELS.includes(candidate)) return candidate;
  if (legacyFallback) return DEFAULT_MODEL;
  throw new Error(`Unsupported Evecode model ${value}. Run \`evecode models\` for the curated catalog.`);
}

export function migrateModel(value) {
  return normalizeModel(value, { legacyFallback: true });
}
