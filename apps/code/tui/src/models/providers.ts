import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel, ModelMessage } from "ai";
import { normalizeModel } from "../../bin/models.mjs";

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
export function resolveModelId(
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
      return normalizeModel(requested);
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }

  return normalizeModel(fallback);
}

export function resolveModel(value: string | undefined): ModelSelection {
  const provider = createOpenAICompatible({
    name: "openai",
    apiKey: process.env.OPENAI_API_KEY?.trim() || "openai-key-not-configured",
    baseURL: process.env.OPENAI_BASE_URL?.trim() || "http://127.0.0.1/v1",
  });
  return {
    model: provider.chatModel(normalizeModel(value)),
    // Use a conservative context-window floor shared by the curated models for compaction.
    modelContextWindowTokens: 128_000,
  };
}
