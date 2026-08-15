import type { ChildProcess } from "node:child_process";
import type { RunDevelopmentTuiInput } from "eve/tui";

export type EvecodeSettings = {
  version?: number;
  model?: string;
  reasoning?: string;
};

export function settingsEnvironment(settings?: EvecodeSettings): Record<string, string>;
export function settingsRequireBuild(
  previous?: EvecodeSettings,
  next?: EvecodeSettings,
): boolean;
export function runtimeMatchesSettings(outputRoot: string, settings?: EvecodeSettings): Promise<boolean>;
export function buildAgent(
  agentRoot: string,
  options?: { quiet?: boolean; settings?: EvecodeSettings },
): Promise<void>;
export function createTuiOptions(input: {
  agentRoot: string;
  serverUrl: string;
}): RunDevelopmentTuiInput;
export function keepChildWhenReady<T extends ChildProcess>(
  child: T,
  readiness: Promise<unknown>,
): Promise<T>;
export function stopChild(
  child: ChildProcess | undefined,
  options?: { graceMs?: number; killMs?: number },
): Promise<void>;
export function scheduleAfterSettled<T>(
  previous: Promise<unknown>,
  operation: () => Promise<T>,
): Promise<T>;
export function runEvecodeAgent(input: {
  agentRoot: string;
  workspace: string;
  settings?: EvecodeSettings;
}): Promise<void>;
