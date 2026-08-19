export type ModelOption = {
  id: string;
  displayName: string;
  description: string;
};

export const CHAT_MODEL = "chatgpt/gpt-5.6-luna";
export const CODE_MODEL = "grok/grok-code";

/**
 * Curated against subproxy's ChatGPT, Grok, and Cursor catalogs. Runtime
 * availability may hide a model, but it never changes membership or order: a
 * user's model choice should mean the same thing in every app.
 */
export const MODELS: readonly ModelOption[] = [
  {
    id: CHAT_MODEL,
    displayName: "GPT-5.6 Luna",
    description: "OpenAI's fast ChatGPT model with image and tool support.",
  },
  {
    id: "chatgpt/gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    description: "OpenAI's stronger ChatGPT model for longer coding work.",
  },
  {
    id: "chatgpt/gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    description: "OpenAI's ChatGPT Sol model.",
  },
  {
    id: "chatgpt/gpt-5.6",
    displayName: "GPT-5.6",
    description: "OpenAI's current GPT-5.6 ChatGPT model.",
  },
  {
    id: "chatgpt/gpt-5.5",
    displayName: "GPT-5.5",
    description: "OpenAI's previous ChatGPT generation.",
  },
  {
    id: "grok/grok-4.6",
    displayName: "Grok 4.6",
    description: "xAI's current general-purpose Grok model.",
  },
  {
    id: "grok/grok-4.5",
    displayName: "Grok 4.5",
    description: "xAI's previous Grok generation.",
  },
  {
    id: "grok/grok-4",
    displayName: "Grok 4",
    description: "xAI's Grok 4 model.",
  },
  {
    id: CODE_MODEL,
    displayName: "Grok Code",
    description: "xAI's coding-focused Grok model.",
  },
  {
    id: "cursor/composer-2.5",
    displayName: "Composer 2.5",
    description: "Cursor's current Composer model.",
  },
  {
    id: "cursor/composer-2",
    displayName: "Composer 2",
    description: "Cursor's previous Composer generation.",
  },
  {
    id: "cursor/auto",
    displayName: "Cursor Auto",
    description: "Cursor's automatic model routing.",
  },
];

const MODEL_IDS = new Set(MODELS.map(({ id }) => id));
const IMAGE_CAPABLE_MODEL_IDS = new Set([
  CHAT_MODEL,
  "chatgpt/gpt-5.6-terra",
  "chatgpt/gpt-5.6-sol",
  "chatgpt/gpt-5.6",
  "chatgpt/gpt-5.5",
  "grok/grok-4.6",
  "grok/grok-4.5",
  "grok/grok-4",
]);

export function isCuratedModel(modelId: string): boolean {
  return MODEL_IDS.has(modelId);
}

export function modelSupportsImages(modelId: string): boolean {
  return IMAGE_CAPABLE_MODEL_IDS.has(modelId);
}
