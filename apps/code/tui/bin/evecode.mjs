#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchEvecodeCommand, parseEvecodeCommand } from "./commands.mjs";
import { migrateOpenRouterModel, normalizeOpenRouterModel } from "./openrouter-models.mjs";
import { runEvecodeAgent } from "./runtime.mjs";
import { tsxInvocation } from "./subprocess.mjs";
import { launchWeb } from "./web-runtime.mjs";
import { resolveLaunchWorkspace } from "./workspace.mjs";

const tuiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runChild(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    const onSigint = () => child.kill("SIGINT");
    const onSigterm = () => child.kill("SIGTERM");
    const cleanup = () => {
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
    };
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
    child.once("error", (error) => {
      cleanup();
      reject(new Error(`Failed to start ${path.basename(command)}: ${error.message}`));
    });
    child.once("exit", (code) => {
      cleanup();
      resolve(code ?? 1);
    });
  });
}

async function readModelConfig() {
  const defaults = { version: 1, model: undefined, reasoning: "high" };
  const explicitDataRoot = process.env.EVECODE_DATA_ROOT?.trim()
    || process.env.EVE_AGENT_HOME?.trim();
  const dataRoot = path.resolve(explicitDataRoot || path.join(os.homedir(), ".evecode"));
  const configPaths = [
    path.join(dataRoot, "config.json"),
    ...(!explicitDataRoot
      ? [path.join(os.homedir(), ".config", "eve-agent", "config.json")]
      : []),
  ];
  for (const configPath of [...new Set(configPaths)]) {
    try {
      return { ...defaults, ...JSON.parse(await readFile(configPath, "utf8")) };
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn(`Ignoring unreadable model config ${configPath}: ${error.message}`);
        break;
      }
    }
  }
  return defaults;
}

function requireOpenRouterKey() {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error("OPENROUTER_API_KEY is required to launch Evecode.");
  }
}

async function launchTui(command) {
  requireOpenRouterKey();
  const workspace = await resolveLaunchWorkspace(command.workspace);
  const modelConfig = await readModelConfig();
  const selectedModel = command.model
    ? normalizeOpenRouterModel(command.model)
    : migrateOpenRouterModel(modelConfig.model);
  if (command.transitional) {
    console.log("Tip: direct TUI launch is a compatibility alias; prefer `evecode launch tui`.");
  }
  console.log(`Evecode TUI workspace: ${workspace}`);
  console.log(`OpenRouter model: ${selectedModel}`);
  console.log("Warning: Evecode's tools can edit files and execute commands here with your host permissions.\n");
  await runEvecodeAgent({
    agentRoot: tuiRoot,
    workspace,
    settings: { ...modelConfig, model: selectedModel },
  });
  return 0;
}

async function runManagement(args) {
  const invocation = tsxInvocation(tuiRoot, [path.join(tuiRoot, "bin", "evecode-cli.ts"), ...args]);
  return runChild(invocation.command, invocation.args);
}

async function main() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 24) throw new Error(`evecode requires Node.js 24 or newer (currently ${process.version}).`);
  const command = parseEvecodeCommand(process.argv.slice(2));
  return dispatchEvecodeCommand(command, {
    management: runManagement,
    tui: launchTui,
    web: async (webCommand) => {
      return launchWeb({
        tuiRoot,
        workspace: await resolveLaunchWorkspace(webCommand.workspace),
        port: webCommand.port,
        open: webCommand.open,
      });
    },
  });
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
