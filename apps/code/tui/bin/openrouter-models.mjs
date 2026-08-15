export const DEFAULT_OPENROUTER_MODEL = "~deepseek/deepseek-v4-flash-latest";

export const OPENROUTER_MODELS = [
  "openai/gpt-5.6-luna",
  "xiaomi/mimo-v2.5",
  "~deepseek/deepseek-v4-flash-latest",
  "z-ai/glm-5.2",
  "minimax/minimax-m3",
  "moonshotai/kimi-k3",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

export function normalizeOpenRouterModel(value, { legacyFallback = false } = {}) {
  if (!value || value === "gateway") return DEFAULT_OPENROUTER_MODEL;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) {
    if (legacyFallback) return DEFAULT_OPENROUTER_MODEL;
    throw new Error(`Invalid OpenRouter model ID ${value}; expected provider/model-id`);
  }
  const provider = value.slice(0, slash);
  const modelId = value.slice(slash + 1);
  const candidate = provider === "chatgpt" || provider === "openai-codex"
    ? `openai/${modelId}`
    : value;
  if (OPENROUTER_MODELS.includes(candidate)) return candidate;
  if (legacyFallback || provider === "xai" || provider === "ollama-cloud") {
    return DEFAULT_OPENROUTER_MODEL;
  }
  throw new Error(`Unsupported Evecode model ${value}. Run \`evecode models\` for the curated catalog.`);
}

export function migrateOpenRouterModel(value) {
  return normalizeOpenRouterModel(value, { legacyFallback: true });
}
