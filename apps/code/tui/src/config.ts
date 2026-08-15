import os from "node:os";
import path from "node:path";

export function hasExplicitDataRoot(): boolean {
  return Boolean(
    process.env.EVECODE_DATA_ROOT?.trim()
      || process.env.EVE_AGENT_HOME?.trim(),
  );
}

export function evecodeDataRoot(): string {
  return path.resolve(
    process.env.EVECODE_DATA_ROOT?.trim()
      || process.env.EVE_AGENT_HOME?.trim()
      || path.join(os.homedir(), ".evecode"),
  );
}

export function legacyEveAgentDataRoot(): string {
  return path.join(os.homedir(), ".config", "eve-agent");
}

export function dataReadPaths(fileName: string): string[] {
  const current = path.join(evecodeDataRoot(), fileName);
  if (hasExplicitDataRoot()) return [current];
  const legacy = path.join(legacyEveAgentDataRoot(), fileName);
  return current === legacy ? [current] : [current, legacy];
}

export function configuredWorkspaceRoot(): string | undefined {
  const configured = process.env.EVECODE_WORKSPACE_ROOT?.trim();
  return configured || undefined;
}
