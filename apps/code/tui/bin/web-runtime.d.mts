export type ProcessInvocation = { command: string; args: string[] };

export function webRootCandidate(tuiRoot: string): string;
export function resolveWebRoot(tuiRoot: string): Promise<string>;
export function nextInvocation(webRoot: string, port: number): ProcessInvocation;
export function browserInvocation(
  url: string,
  options?: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv },
): ProcessInvocation;
export function webProcessOptions(
  webRoot: string,
  workspace: string,
  env?: NodeJS.ProcessEnv,
): { cwd: string; env: NodeJS.ProcessEnv; stdio: "inherit" };
export function waitUntilWebReady(
  url: string,
  child: import("node:child_process").ChildProcess,
  options?: {
    fetchFn?: typeof fetch;
    timeoutMs?: number;
    retryMs?: number;
  },
): Promise<void>;
export function waitForWebExit(
  child: import("node:child_process").ChildProcess,
): Promise<number>;
export function launchWeb(input: {
  tuiRoot: string;
  workspace: string;
  port: number;
  open?: boolean;
}): Promise<number>;
