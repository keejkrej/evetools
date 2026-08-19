import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { runDevelopmentTui } from "eve/tui";
import { eveInvocation } from "./subprocess.mjs";
import { runEvecodeModelFlow } from "./tui-model-flow.mjs";

const SETTINGS_CHANGED = Symbol.for("evecode/settings-changed");

export function settingsEnvironment(settings = {}) {
  return {
    ...(settings.model ? { EVECODE_TUI_MODEL_OVERRIDE: settings.model } : {}),
    ...(settings.reasoning ? { EVECODE_TUI_REASONING_OVERRIDE: settings.reasoning } : {}),
  };
}

export function settingsRequireBuild(previous = {}, next = {}) {
  return (previous.reasoning ?? "high") !== (next.reasoning ?? "high");
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      socket.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function childHasExited(child) {
  return child.exitCode != null || child.signalCode != null;
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

export async function stopChild(child, { graceMs = 2_000, killMs = 500 } = {}) {
  if (!child || childHasExited(child)) return;
  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }
  if (await waitForExitWithin(child, graceMs)) return;
  try {
    child.kill("SIGKILL");
  } catch {
    return;
  }
  await waitForExitWithin(child, killMs);
}

export async function keepChildWhenReady(child, readiness) {
  try {
    await readiness;
    return child;
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

export function scheduleAfterSettled(previous, operation) {
  return previous.then(operation, operation);
}

async function waitUntilReady(url, child, stderr) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (childHasExited(child)) {
      const outcome = child.exitCode != null
        ? `status ${child.exitCode}`
        : `signal ${child.signalCode}`;
      throw new Error(`Evecode server exited during startup with ${outcome}.\n${stderr.value}`.trim());
    }
    try {
      const response = await fetch(new URL("/eve/v1/info", url), {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
    } catch {
      // The server is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out starting the Evecode server.\n${stderr.value}`.trim());
}

export async function buildAgent(agentRoot, { quiet = false, settings = {} } = {}) {
  await new Promise((resolve, reject) => {
    const invocation = eveInvocation(agentRoot, ["build"]);
    const child = spawn(invocation.command, invocation.args, {
      cwd: agentRoot,
      env: { ...process.env, ...settingsEnvironment(settings) },
      stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    if (quiet) {
      child.stdout?.on("data", (chunk) => { output = `${output}${chunk}`.slice(-20_000); });
      child.stderr?.on("data", (chunk) => { output = `${output}${chunk}`.slice(-20_000); });
    }
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`Evecode build exited with status ${code ?? "unknown"}.\n${output}`.trim())));
  });
}

export async function runtimeMatchesSettings(outputRoot, settings = {}) {
  try {
    const manifestPath = path.join(outputRoot, ".eve", "compile", "compiled-agent-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const config = manifest?.config;
    if (!config?.dynamicModel?.eventNames?.includes("step.started")) return false;
    if (config?.reasoning !== (settings.reasoning ?? "high")) return false;
    return true;
  } catch {
    return false;
  }
}

async function ensureRuntime(agentRoot, settings) {
  const outputRoot = path.join(agentRoot, ".output");
  const output = path.join(outputRoot, "server", "index.mjs");
  let hasOutput = true;
  try {
    await access(output);
  } catch {
    hasOutput = false;
  }
  if (!hasOutput || !await runtimeMatchesSettings(outputRoot, settings)) {
    await buildAgent(agentRoot, { quiet: hasOutput, settings });
  }
}

export function createTuiOptions({ agentRoot, serverUrl }) {
  return {
    name: "Evecode",
    target: { kind: "local", serverUrl, workspaceRoot: agentRoot },
    modelCommand: ({ appRoot, serverUrl: liveServerUrl, argument, prompter }) =>
      runEvecodeModelFlow({ appRoot, serverUrl: liveServerUrl, argument, prompter }),
    headerTips: [
      "Use /model to switch model and thinking level.",
      "Use /traces to inspect a run.",
      "Type /help to see every command.",
    ],
    externalProviderDisplayNames: { openai: "OpenAI" },
    showVercelAuthSetupIssues: false,
  };
}

export async function runEvecodeAgent({ agentRoot, workspace, settings = {} }) {
  await ensureRuntime(agentRoot, settings);
  const port = await availablePort();
  const serverUrl = `http://127.0.0.1:${port}`;
  let server;
  let runtimeSettings = settings;
  let transition = Promise.resolve();

  const startServer = async () => {
    const stderr = { value: "" };
    const invocation = eveInvocation(agentRoot, [
      "start",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ]);
    const child = spawn(invocation.command, invocation.args, {
      cwd: agentRoot,
      env: {
        ...process.env,
        ...settingsEnvironment(runtimeSettings),
        EVECODE_WORKSPACE_ROOT: workspace,
        EVE_DEV: "1",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr?.on("data", (chunk) => {
      stderr.value = `${stderr.value}${chunk}`.slice(-20_000);
    });
    server = await keepChildWhenReady(child, waitUntilReady(serverUrl, child, stderr));
  };

  await startServer();
  globalThis[SETTINGS_CHANGED] = (nextSettings) => {
    transition = scheduleAfterSettled(transition, async () => {
      const requiresBuild = settingsRequireBuild(runtimeSettings, nextSettings);
      if (requiresBuild) {
        await buildAgent(agentRoot, { quiet: true, settings: nextSettings });
      }
      runtimeSettings = nextSettings;
      await stopChild(server);
      await startServer();
    });
    return transition;
  };

  const stop = async () => {
    delete globalThis[SETTINGS_CHANGED];
    await stopChild(server);
  };
  const onSignal = () => {
    void stop().finally(() => process.exit(130));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    await runDevelopmentTui(createTuiOptions({ agentRoot, serverUrl }));
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await stop();
  }
}
