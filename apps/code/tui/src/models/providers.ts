import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel, ModelMessage } from "ai";
import { normalizeOpenRouterModel } from "../../bin/openrouter-models.mjs";

const CLIENT_CONTEXT_PREFIX = "Client context:\n";

export type ModelSelection = {
  model: LanguageModel;
  modelContextWindowTokens: number;
};

type EvecodeClientContext = {
  evecode?: {
    model?: unknown;
  };
};

function messageText(message: ModelMessage): string | undefined {
  if (message.role !== "user") return undefined;
  if (typeof message.content === "string") return message.content;
  return undefined;
}

/**
 * Resolves the model requested by an Evecode UI for the current turn.
 *
 * Eve's HTTP client projects `clientContext` objects into an ephemeral user
 * context message. Keeping the selection in that standard envelope lets the
 * web adapter choose a curated model without adding a product-specific route
 * to the agent runtime. The TUI has no per-turn envelope and uses its process
 * setting as the fallback.
 */
export function resolveOpenRouterModelId(
  messages: readonly ModelMessage[],
  fallback: string | undefined,
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = messageText(messages[index]!);
    if (!content?.startsWith(CLIENT_CONTEXT_PREFIX)) continue;

    try {
      const context = JSON.parse(content.slice(CLIENT_CONTEXT_PREFIX.length)) as EvecodeClientContext;
      const requested = context?.evecode?.model;
      if (requested === undefined) continue;
      if (typeof requested !== "string") {
        throw new Error("Evecode client model must be a string.");
      }
      return normalizeOpenRouterModel(requested);
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }

  return normalizeOpenRouterModel(fallback);
}

export function resolveOpenRouterModel(value: string | undefined): ModelSelection {
  const provider = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY?.trim() || "openrouter-key-not-configured",
  });
  return {
    model: provider(normalizeOpenRouterModel(value)),
    // Use a conservative context-window floor shared by the curated models for compaction.
    modelContextWindowTokens: 128_000,
  };
}
