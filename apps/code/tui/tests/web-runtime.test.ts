import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  browserInvocation,
  launchWeb,
  nextInvocation,
  resolveWebRoot,
  waitForWebExit,
  waitUntilWebReady,
  webProcessOptions,
  webRootCandidate,
} from "../bin/web-runtime.mjs";

test("web launch locates the sibling source app and invokes Next through Node", async () => {
  const tuiRoot = path.resolve(".");
  const webRoot = path.resolve("..", "web");
  assert.equal(webRootCandidate(tuiRoot), webRoot);
  assert.equal(await resolveWebRoot(tuiRoot), webRoot);
  assert.deepEqual(nextInvocation(webRoot, 4312), {
    command: process.execPath,
    args: [
      path.join(webRoot, "node_modules", "next", "dist", "bin", "next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "4312",
    ],
  });
  assert.deepEqual(webProcessOptions(webRoot, "/repo", { EXISTING: "kept" }), {
    cwd: webRoot,
    env: { EXISTING: "kept", EVECODE_WORKSPACE_ROOT: "/repo" },
    stdio: "inherit",
  });
});

test("web readiness reports spawn errors without waiting for the timeout", async () => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  };
  child.exitCode = null;
  child.signalCode = null;
  queueMicrotask(() => child.emit("error", new Error("spawn failed")));
  await assert.rejects(waitUntilWebReady(
    "http://127.0.0.1:3000",
    child as unknown as ChildProcess,
    {
      fetchFn: async () => { throw new Error("not listening"); },
      retryMs: 1,
      timeoutMs: 100,
    },
  ), /spawn failed/);
});

test("web supervision observes signal exits before and during readiness", async () => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  };
  child.exitCode = null;
  child.signalCode = "SIGINT";
  assert.equal(await waitForWebExit(child as unknown as ChildProcess), 130);
  await assert.rejects(waitUntilWebReady(
    "http://127.0.0.1:3000",
    child as unknown as ChildProcess,
    { fetchFn: async () => new Response("ok"), timeoutMs: 100 },
  ), /signal SIGINT/);
});

test("web readiness does not accept an HTTP error page", async () => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  };
  child.exitCode = null;
  child.signalCode = null;
  await assert.rejects(waitUntilWebReady(
    "http://127.0.0.1:3000",
    child as unknown as ChildProcess,
    {
      fetchFn: async () => new Response("broken", { status: 500 }),
      retryMs: 1,
      timeoutMs: 5,
    },
  ), /Timed out/);
});

test("web readiness verifies the proxied Eve backend with trusted local headers", async () => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  };
  child.exitCode = null;
  child.signalCode = null;
  const calls: Array<{ url: string; headers: Headers }> = [];
  await waitUntilWebReady(
    "http://127.0.0.1:3000",
    child as unknown as ChildProcess,
    {
      fetchFn: async (input, init) => {
        calls.push({
          url: String(input),
          headers: new Headers(init?.headers),
        });
        return new Response("ok");
      },
      timeoutMs: 100,
    },
  );

  assert.deepEqual(calls.map(({ url }) => url), [
    "http://127.0.0.1:3000/",
    "http://127.0.0.1:3000/eve/v1/info",
  ]);
  assert.equal(calls[1]?.headers.get("origin"), "http://127.0.0.1:3000");
  assert.equal(calls[1]?.headers.get("sec-fetch-site"), "same-origin");
  assert.equal(calls[1]?.headers.get("accept"), "application/json");
});

test("web readiness rejects a live frontend when the shared Eve backend is down", async () => {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  };
  child.exitCode = null;
  child.signalCode = null;
  let eveProbes = 0;
  await assert.rejects(waitUntilWebReady(
    "http://127.0.0.1:3000",
    child as unknown as ChildProcess,
    {
      fetchFn: async (input) => {
        if (String(input).endsWith("/eve/v1/info")) {
          eveProbes += 1;
          return new Response("Eve unavailable", { status: 503 });
        }
        return new Response("Next ready");
      },
      retryMs: 1,
      timeoutMs: 10,
    },
  ), /Eve backend/);
  assert.ok(eveProbes > 0);
});

test("packed TUI installs fail clearly when the web surface is absent", async () => {
  const packedRoot = await mkdtemp(path.join(os.tmpdir(), "evecode-packed-tui-"));
  await assert.rejects(resolveWebRoot(packedRoot), /web surface is unavailable.*source checkout/i);
  await assert.rejects(launchWeb({
    tuiRoot: packedRoot,
    workspace: packedRoot,
    port: 3000,
    open: false,
  }), /web surface is unavailable.*source checkout/i);
});

test("browser opening uses native cross-platform commands without launching them", () => {
  assert.deepEqual(browserInvocation("http://127.0.0.1:3000", { platform: "darwin" }), {
    command: "open",
    args: ["http://127.0.0.1:3000"],
  });
  assert.deepEqual(browserInvocation("http://127.0.0.1:3000", {
    platform: "win32",
    env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
  }), {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "start", "", "http://127.0.0.1:3000"],
  });
  assert.deepEqual(browserInvocation("http://127.0.0.1:3000", { platform: "linux" }), {
    command: "xdg-open",
    args: ["http://127.0.0.1:3000"],
  });
});
