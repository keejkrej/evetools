import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isCuratedModel, MODELS, type ModelOption } from "./catalog";

const MODEL_CACHE_TTL = 10 * 60 * 1000;

type LiveModelRecord = {
  id?: unknown;
};

type ModelCache = {
  models: ModelOption[];
  expiresAt: number;
};

let modelCache: ModelCache | undefined;

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function hasOpenAiConfig(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim() && env.OPENAI_BASE_URL?.trim());
}

function requireOpenAiConfig(): { apiKey: string; baseURL: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  if (!apiKey || !baseURL) {
    throw new Error("OPENAI_BASE_URL and OPENAI_API_KEY are required.");
  }
  return { apiKey, baseURL: trimSlash(baseURL) };
}

export function openAiModel(modelId: string) {
  if (!isCuratedModel(modelId)) {
    throw new Error(`Unsupported model: ${modelId}`);
  }
  const { apiKey, baseURL } = requireOpenAiConfig();
  return createOpenAICompatible({
    name: "openai",
    apiKey,
    baseURL,
  }).chatModel(modelId);
}

function normalizeLiveCatalog(records: LiveModelRecord[]): ModelOption[] {
  const liveIds = new Set(
    records.flatMap((record) =>
      typeof record.id === "string" ? [record.id] : [],
    ),
  );

  return MODELS.filter((fallback) => liveIds.has(fallback.id));
}

export async function listModels(): Promise<{
  models: ModelOption[];
  source: "live" | "fallback";
}> {
  if (!hasOpenAiConfig()) {
    return { models: [...MODELS], source: "fallback" };
  }

  if (modelCache && modelCache.expiresAt > Date.now()) {
    return { models: modelCache.models, source: "live" };
  }

  const { apiKey, baseURL } = requireOpenAiConfig();
  try {
    const response = await fetch(`${baseURL}/models`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) throw new Error("Model catalog request failed.");
    const payload = (await response.json()) as { data?: unknown };
    if (!Array.isArray(payload.data)) {
      throw new Error("Model catalog was invalid.");
    }
    const models = normalizeLiveCatalog(payload.data as LiveModelRecord[]);
    if (!models.length) {
      return { models: [...MODELS], source: "fallback" };
    }
    modelCache = {
      expiresAt: Date.now() + MODEL_CACHE_TTL,
      models,
    };
    return { models, source: "live" };
  } catch {
    return { models: [...MODELS], source: "fallback" };
  }
}
