import { spawn, type ChildProcess } from "node:child_process";

const DEFAULT_TERMINATE_GRACE_MS = 500;
const DEFAULT_FORCE_KILL_GRACE_MS = 250;
const PROCESS_POLL_MS = 25;

export type ProcessTreeKillInvocation = {
  command: string;
  args: string[];
};

export function windowsProcessTreeKillInvocation(
  pid: number,
  force: boolean,
): ProcessTreeKillInvocation {
  return {
    command: "taskkill",
    args: ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])],
  };
}

function launchWindowsTreeKill(pid: number, force: boolean): void {
  const invocation = windowsProcessTreeKillInvocation(pid, force);
  try {
    const killer = spawn(invocation.command, invocation.args, {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", () => undefined);
    killer.unref();
  } catch {
    // A later forced attempt still gets a chance if taskkill could not launch.
  }
}

export function signalPosixProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals,
  processKill: typeof process.kill = process.kill,
): void {
  if (child.pid === undefined) return;
  try {
    processKill(-child.pid, signal);
    return;
  } catch {
    // The group may already be gone or unavailable. Fall back to its leader.
  }
  try {
    child.kill(signal);
  } catch {
    // The process exited between the liveness check and signal delivery.
  }
}

function signalProcessTree(
  child: ChildProcess,
  signal: "SIGTERM" | "SIGKILL",
  platform: NodeJS.Platform,
): void {
  if (child.pid === undefined) return;
  if (platform === "win32") {
    launchWindowsTreeKill(child.pid, signal === "SIGKILL");
    return;
  }
  signalPosixProcessTree(child, signal);
}

function isPosixProcessGroupAlive(child: ChildProcess): boolean {
  if (child.pid === undefined) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function hasTerminated(child: ChildProcess, platform: NodeJS.Platform): boolean {
  const leaderExited = child.exitCode !== null || child.signalCode !== null;
  if (!leaderExited) return false;
  return platform === "win32" || !isPosixProcessGroupAlive(child);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTermination(
  child: ChildProcess,
  platform: NodeJS.Platform,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!hasTerminated(child, platform) && Date.now() < deadline) {
    await sleep(Math.min(PROCESS_POLL_MS, Math.max(1, deadline - Date.now())));
  }
  return hasTerminated(child, platform);
}

/**
 * Stops a command and every descendant created in its process tree.
 *
 * POSIX commands are spawned as process-group leaders, so both stages target
 * the negative group PID. Windows has no equivalent Node API; taskkill /T is
 * the native tree operation and /F is its bounded escalation.
 */
export async function terminateProcessTree(
  child: ChildProcess,
  {
    platform = process.platform,
    terminateGraceMs = DEFAULT_TERMINATE_GRACE_MS,
    forceKillGraceMs = DEFAULT_FORCE_KILL_GRACE_MS,
  }: {
    platform?: NodeJS.Platform;
    terminateGraceMs?: number;
    forceKillGraceMs?: number;
  } = {},
): Promise<void> {
  if (child.pid === undefined) return;

  signalProcessTree(child, "SIGTERM", platform);
  if (await waitForTermination(child, platform, terminateGraceMs)) return;

  signalProcessTree(child, "SIGKILL", platform);
  if (await waitForTermination(child, platform, forceKillGraceMs)) return;

  // Never let an uncooperative or unobservable descendant hold the agent open.
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref();
}
