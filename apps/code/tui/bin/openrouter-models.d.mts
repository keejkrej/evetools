export const DEFAULT_OPENROUTER_MODEL: "~deepseek/deepseek-v4-flash-latest";
export const OPENROUTER_MODELS: readonly string[];
export function normalizeOpenRouterModel(
  value: string | undefined,
  options?: { legacyFallback?: boolean },
): string;
export function migrateOpenRouterModel(value: string | undefined): string;
