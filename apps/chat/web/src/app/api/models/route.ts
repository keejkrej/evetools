import { Cursor, type SDKModel } from "@cursor/sdk";
import { authorizeOwner } from "@/lib/owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_MODELS = [
  {
    id: "default",
    displayName: "Auto",
    description: "Let Cursor choose the best available model.",
  },
  {
    id: "composer-2.5",
    displayName: "Composer 2.5",
    description: "Cursor’s agent-focused model.",
  },
];

const OLLAMA_FALLBACK_MODELS = [
  {
    id: "gpt-oss:120b",
    displayName: "gpt-oss:120b",
    description: "Ollama Cloud model.",
  },
];

let cachedModels: SDKModel[] | null = null;
let cachedAt = 0;

export async function GET(request: Request) {
  const unauthorized = await authorizeOwner();
  if (unauthorized) return unauthorized;

  const provider = new URL(request.url).searchParams.get("provider") ?? "cursor";
  if (provider === "ollama") {
    if (!process.env.OLLAMA_API_KEY) {
      return Response.json({
        models: OLLAMA_FALLBACK_MODELS,
        source: "fallback",
      });
    }

    try {
      const response = await fetch("https://ollama.com/api/tags", {
        headers: { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` },
        next: { revalidate: 600 },
      });
      if (!response.ok) throw new Error("Could not load Ollama models.");
      const payload = (await response.json()) as {
        models?: Array<{ name?: string; model?: string; details?: { family?: string } }>;
      };
      const models = (payload.models ?? [])
        .map((model) => {
          const id = model.model ?? model.name;
          return id
            ? {
                id,
                displayName: model.name ?? id,
                description: model.details?.family
                  ? `Ollama Cloud · ${model.details.family}`
                  : "Ollama Cloud model.",
              }
            : null;
        })
        .filter((model): model is (typeof OLLAMA_FALLBACK_MODELS)[number] => model !== null);
      return Response.json({
        models: models.length ? models : OLLAMA_FALLBACK_MODELS,
        source: "ollama",
      });
    } catch {
      return Response.json({
        models: OLLAMA_FALLBACK_MODELS,
        source: "fallback",
      });
    }
  }

  if (!process.env.CURSOR_API_KEY) {
    return Response.json({
      models: FALLBACK_MODELS,
      source: "fallback",
    });
  }

  try {
    if (!cachedModels || Date.now() - cachedAt > 10 * 60 * 1000) {
      cachedModels = await Cursor.models.list();
      cachedAt = Date.now();
    }
    const models = cachedModels.map((model) => ({
      id: model.id,
      displayName: model.displayName,
      description: model.description,
    }));
    return Response.json({ models, source: "cursor" });
  } catch {
    return Response.json({
      models: FALLBACK_MODELS,
      source: "fallback",
    });
  }
}
