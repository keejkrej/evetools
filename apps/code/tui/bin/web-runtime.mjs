import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

export function webRootCandidate(tuiRoot) {
  return path.resolve(tuiRoot, "..", "web");
}

export async function resolveWebRoot(tuiRoot) {
  const webRoot = webRootCandidate(tuiRoot);
  try {
    const manifest = JSON.parse(await readFile(path.join(webRoot, "package.json"), "utf8"));
    if (manifest.name !== "@evetools/code") throw new Error("unexpected package name");
    await readFile(path.join(webRoot, "node_modules", "next", "dist", "bin", "next"));
    return webRoot;
  } catch {
    throw new Error(
      "The Evecode web surface is unavailable in this install. Run `evecode launch web` from an Evetools source checkout containing apps/code/web with dependencies installed.",
    );
  }
}

export function nextInvocation(webRoot, port) {
  return {
    command: process.execPath,
    args: [
      path.join(webRoot, "node_modules", "next", "dist", "bin", "next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
  };
}

export function browserInvocation(url, { platform = process.platform, env = process.env } = {}) {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") {
    return {
      command: env.ComSpec?.trim() || env.COMSPEC?.trim() || "cmd.exe",
      args: ["/d", "/s", "/c", "start", "", url],
    };
  }
  return { command: "xdg-open", args: [url] };
}

export function webProcessOptions(webRoot, workspace, env = process.env) {
  return {
    cwd: webRoot,
    env: { ...env, EVECODE_WORKSPACE_ROOT: workspace },
    stdio: "inherit",
  };
}

function childHasExited(child) {
  return child.exitCode != null || child.signalCode != null;
}

export function waitForWebExit(child) {
  const status = (code, signal) => code
    ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
  if (childHasExited(child)) return Promise.resolve(status(child.exitCode, child.signalCode));
  return new Promise((resolve) => child.once("exit", (code, signal) => resolve(status(code, signal))));
}

async function waitForExitWithin(child, timeoutMs) {
  if (childHasExited(child)) return true;
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolve(childHasExited(child));
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (childHasExited(child)) return;
  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }
  if (await waitForExitWithin(child, 2_000)) return;
  try {
    child.kill("SIGKILL");
  } catch {
    return;
  }
  await waitForExitWithin(child, 500);
}

export async function waitUntilWebReady(
  url,
  child,
  { fetchFn = fetch, timeoutMs = 60_000, retryMs = 100 } = {},
) {
  let spawnError;
  const onError = (error) => { spawnError = error; };
  child.once("error", onError);
  const deadline = Date.now() + timeoutMs;
  const frontendUrl = new URL(url);
  const eveInfoUrl = new URL("/eve/v1/info", frontendUrl);
  const eveHeaders = {
    accept: "application/json",
    origin: frontendUrl.origin,
    "sec-fetch-site": "same-origin",
  };
  const probe = async (target, headers) => {
    const response = await fetchFn(target.href, {
      headers,
      signal: AbortSignal.timeout(Math.min(1_000, Math.max(1, deadline - Date.now()))),
    });
    const ready = response.ok;
    await response.body?.cancel();
    return ready;
  };
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`Failed to start Evecode web: ${spawnError.message}`);
      if (childHasExited(child)) {
        const outcome = child.exitCode != null
          ? `status ${child.exitCode}`
          : `signal ${child.signalCode}`;
        throw new Error(`Evecode web exited during startup with ${outcome}.`);
      }
      try {
        const frontendReady = await probe(frontendUrl);
        const eveReady = frontendReady && await probe(eveInfoUrl, eveHeaders);
        if (frontendReady && eveReady) return;
      } catch {
        // Next or its shared Eve backend may still be compiling.
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
    throw new Error(`Timed out starting Evecode web and its Eve backend at ${url}.`);
  } finally {
    child.removeListener("error", onError);
  }
}

function openBrowser(url) {
  const invocation = browserInvocation(url);
  const browser = spawn(invocation.command, invocation.args, {
    detached: true,
    stdio: "ignore",
  });
  browser.on("error", (error) => {
    console.warn(`Could not open ${url}: ${error.message}`);
  });
  browser.unref();
}

export async function launchWeb({ tuiRoot, workspace, port, open = true }) {
  const webRoot = await resolveWebRoot(tuiRoot);
  if (!process.env.OPENAI_API_KEY?.trim() || !process.env.OPENAI_BASE_URL?.trim()) {
    throw new Error("OPENAI_BASE_URL and OPENAI_API_KEY are required to launch Evecode web.");
  }
  const invocation = nextInvocation(webRoot, port);
  const child = spawn(invocation.command, invocation.args, webProcessOptions(webRoot, workspace));
  const url = `http://127.0.0.1:${port}`;
  const forwardSignal = (signal) => {
    try {
      child.kill(signal);
    } catch {
      // The process may have exited between the signal and this handler.
    }
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  try {
    console.log(`Evecode web workspace: ${workspace}`);
    console.log(`Starting Evecode web at ${url}`);
    await waitUntilWebReady(url, child);
    if (open) openBrowser(url);
    return await waitForWebExit(child);
  } catch (error) {
    const observedSignal = child.signalCode;
    await stopChild(child);
    if (observedSignal != null) return await waitForWebExit(child);
    throw error;
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  }
}
