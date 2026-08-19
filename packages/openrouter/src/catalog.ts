export type OpenRouterModelOption = {
  id: string;
  displayName: string;
  description: string;
};

export const CHAT_OPENROUTER_MODEL = "openai/gpt-5.6-luna";
export const CODE_OPENROUTER_MODEL = "~deepseek/deepseek-v4-flash-latest";

/**
 * Curated on 2026-08-15 against OpenRouter's programming/tool-calling
 * collections and authenticated live catalog. Runtime availability may hide a
 * model, but it never changes membership or order: a user's model choice should
 * mean the same thing in every app.
 */
export const OPENROUTER_MODELS: readonly OpenRouterModelOption[] = [
  {
    id: CHAT_OPENROUTER_MODEL,
    displayName: "GPT-5.6 Luna",
    description: "OpenAI's fast model with image, file, and tool support.",
  },
  {
    id: "xiaomi/mimo-v2.5",
    displayName: "MiMo V2.5",
    description: "Xiaomi's multimodal model for chat and tool use.",
  },
  {
    id: CODE_OPENROUTER_MODEL,
    displayName: "DeepSeek V4 Flash (latest)",
    description: "The latest DeepSeek V4 Flash model for fast coding and tool use.",
  },
  {
    id: "z-ai/glm-5.2",
    displayName: "GLM 5.2",
    description: "Z.ai's general-purpose model with tool use.",
  },
  {
    id: "minimax/minimax-m3",
    displayName: "MiniMax M3",
    description: "MiniMax's multimodal general-purpose model with tool use.",
  },
  {
    id: "moonshotai/kimi-k3",
    displayName: "Kimi K3",
    description: "Moonshot AI's multimodal general-purpose model with tool use.",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    displayName: "Nemotron 3 Ultra 550B (free)",
    description: "NVIDIA's Nemotron 3 Ultra model on OpenRouter's free route.",
  },
];

const OPENROUTER_MODEL_IDS = new Set(OPENROUTER_MODELS.map(({ id }) => id));
const IMAGE_CAPABLE_MODEL_IDS = new Set([
  CHAT_OPENROUTER_MODEL,
  "xiaomi/mimo-v2.5",
  "minimax/minimax-m3",
  "moonshotai/kimi-k3",
]);

export function isCuratedOpenRouterModel(modelId: string): boolean {
  return OPENROUTER_MODEL_IDS.has(modelId);
}

export function openRouterModelSupportsImages(modelId: string): boolean {
  return IMAGE_CAPABLE_MODEL_IDS.has(modelId);
}
