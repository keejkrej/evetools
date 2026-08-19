import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  isCuratedOpenRouterModel,
  OPENROUTER_MODELS,
  type OpenRouterModelOption,
} from "./catalog";

const MODELS_URL = "https://openrouter.ai/api/v1/models/user";
const MODEL_CACHE_TTL = 10 * 60 * 1000;

type OpenRouterModelRecord = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  supported_parameters?: unknown;
};

type ModelCache = {
  models: OpenRouterModelOption[];
  requireTools: boolean;
  expiresAt: number;
};

let modelCache: ModelCache | undefined;

export function hasOpenRouterApiKey(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.OPENROUTER_API_KEY?.trim());
}

function requireOpenRouterApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");
  return apiKey;
}

export function openRouterModel(modelId: string) {
  if (!isCuratedOpenRouterModel(modelId)) {
    throw new Error(`Unsupported OpenRouter model: ${modelId}`);
  }
  return createOpenRouter({ apiKey: requireOpenRouterApiKey() })(modelId);
}

function canonicalCatalogId(id: string): string {
  return id.startsWith("~") ? id.slice(1) : id;
}

function conciseDescription(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}…` : compact;
}

function normalizeLiveCatalog(
  records: OpenRouterModelRecord[],
  requireTools: boolean,
): OpenRouterModelOption[] {
  const liveModels = new Map(
    records.flatMap((record) =>
      typeof record.id === "string" ? [[record.id, record] as const] : [],
    ),
  );

  return OPENROUTER_MODELS.flatMap((fallback) => {
    const live =
      liveModels.get(fallback.id) ??
      liveModels.get(canonicalCatalogId(fallback.id));
    if (!live) return [];
    if (
      requireTools &&
      (!Array.isArray(live.supported_parameters) ||
        !live.supported_parameters.includes("tools"))
    ) {
      return [];
    }
    return [
      {
        id: fallback.id,
        displayName:
          typeof live.name === "string" && live.name.trim()
            ? live.name.trim()
            : fallback.displayName,
        description:
          typeof live.description === "string" && live.description.trim()
            ? conciseDescription(live.description)
            : fallback.description,
      },
    ];
  });
}

export async function listOpenRouterModels(
  options: { requireTools?: boolean } = {},
): Promise<{
  models: OpenRouterModelOption[];
  source: "openrouter" | "fallback";
}> {
  const requireTools = options.requireTools ?? false;
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return { models: [...OPENROUTER_MODELS], source: "fallback" };
  }

  if (
    modelCache &&
    modelCache.requireTools === requireTools &&
    modelCache.expiresAt > Date.now()
  ) {
    return { models: modelCache.models, source: "openrouter" };
  }

  try {
    const response = await fetch(MODELS_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) throw new Error("OpenRouter model catalog request failed.");
    const payload = (await response.json()) as { data?: unknown };
    if (!Array.isArray(payload.data)) {
      throw new Error("OpenRouter returned an invalid model catalog.");
    }
    const models = normalizeLiveCatalog(
      payload.data as OpenRouterModelRecord[],
      requireTools,
    );
    if (!models.length) {
      return { models: [...OPENROUTER_MODELS], source: "fallback" };
    }
    modelCache = {
      expiresAt: Date.now() + MODEL_CACHE_TTL,
      models,
      requireTools,
    };
    return { models, source: "openrouter" };
  } catch {
    return { models: [...OPENROUTER_MODELS], source: "fallback" };
  }
}
