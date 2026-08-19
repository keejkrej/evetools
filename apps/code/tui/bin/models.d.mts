export const DEFAULT_MODEL: "grok/grok-code";
export const MODELS: readonly string[];
export function normalizeModel(
  value: string | undefined,
  options?: { legacyFallback?: boolean },
): string;
export function migrateModel(value: string | undefined): string;
