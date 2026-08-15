import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { signalPosixProcessTree, windowsProcessTreeKillInvocation } from "../agent/lib/process-tree.js";
import bash from "../agent/tools/bash.js";

function posixQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function ignoredSigtermCommand(pidFile: string): string {
  const script = [
    `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))`,
    `process.on("SIGTERM", () => undefined)`,
    `setInterval(() => undefined, 1_000)`,
  ].join(";");
  return `${posixQuote(process.execPath)} -e ${posixQuote(script)}`;
}

async function waitForPid(pidFile: string): Promise<number> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      return Number.parseInt(await readFile(pidFile, "utf8"), 10);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("test process did not publish its PID");
}

async function assertProcessExited(pid: number): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch {
      return;
    }
  }
  assert.fail(`process ${pid} survived tree termination`);
}

test("process-tree signals target POSIX groups and Windows descendants", () => {
  const signals: Array<[number, NodeJS.Signals | number]> = [];
  const child = {
    pid: 4242,
    kill: () => true,
  };
  signalPosixProcessTree(
    child as never,
    "SIGTERM",
    ((pid, signal) => {
      if (signal === undefined) throw new Error("expected a process signal");
      signals.push([pid, signal as NodeJS.Signals | number]);
      return true;
    }) as typeof process.kill,
  );
  assert.deepEqual(signals, [[-4242, "SIGTERM"]]);
  assert.deepEqual(windowsProcessTreeKillInvocation(4242, false), {
    command: "taskkill",
    args: ["/PID", "4242", "/T"],
  });
  assert.deepEqual(windowsProcessTreeKillInvocation(4242, true), {
    command: "taskkill",
    args: ["/PID", "4242", "/T", "/F"],
  });
});

test("bash timeout escalates past ignored SIGTERM and reaps the process tree", {
  skip: process.platform === "win32",
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evecode-bash-timeout-"));
  const pidFile = path.join(root, "command.pid");
  process.env.EVECODE_WORKSPACE_ROOT = root;
  const startedAt = Date.now();

  const result = await bash.execute({
    command: ignoredSigtermCommand(pidFile),
    timeoutSeconds: 1,
  }, { abortSignal: new AbortController().signal } as never) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.cancelled, false);
  assert.ok(Date.now() - startedAt < 3_000, "timeout escalation exceeded its bound");
  await assertProcessExited(await waitForPid(pidFile));
});

test("bash cancellation is bounded and reaps a command that ignores SIGTERM", {
  skip: process.platform === "win32",
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evecode-bash-cancel-"));
  const pidFile = path.join(root, "command.pid");
  process.env.EVECODE_WORKSPACE_ROOT = root;
  const controller = new AbortController();
  const startedAt = Date.now();
  const execution = bash.execute({
    command: ignoredSigtermCommand(pidFile),
    timeoutSeconds: 30,
  }, { abortSignal: controller.signal } as never) as Promise<Record<string, unknown>>;
  const pid = await waitForPid(pidFile);
  controller.abort();

  const result = await execution;
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, false);
  assert.equal(result.cancelled, true);
  assert.ok(Date.now() - startedAt < 2_000, "cancellation escalation exceeded its bound");
  await assertProcessExited(pid);
});
