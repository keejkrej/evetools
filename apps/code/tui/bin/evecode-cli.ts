import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evecodeDataRoot } from "../src/config.js";
import { readConfig, setSelectedModel } from "../src/models/config-store.js";
import {
  DEFAULT_MODEL,
  migrateModel,
  normalizeModel,
  MODELS,
} from "./models.mjs";
import { resolveLaunchWorkspace } from "./workspace.mjs";

function usage(): never {
  console.log(`Usage:
  evecode launch tui [--model provider/model-id] [workspace]
  evecode launch web [--port 3000] [--no-open] [workspace]
  evecode status
  evecode model [provider/model-id]
  evecode models
  evecode login  # show environment authentication status
  evecode auth status  # compatibility alias

  evecode [--model provider/model-id] [workspace]  # transitional TUI alias

Authentication is supplied only through OPENAI_BASE_URL and OPENAI_API_KEY.

Examples:
  evecode model chatgpt/gpt-5.6-luna
  evecode launch tui --model grok/grok-code .
  evecode launch web --no-open .`);
  process.exit(0);
}

async function fileAvailable(...segments: string[]): Promise<boolean> {
  try {
    await access(path.join(...segments));
    return true;
  } catch {
    return false;
  }
}

async function status(): Promise<void> {
  const config = await readConfig();
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const webRoot = path.resolve(packageRoot, "..", "web");
  const workspace = await resolveLaunchWorkspace();
  const [tuiAvailable, webPackageAvailable, webRuntimeAvailable] = await Promise.all([
    fileAvailable(packageRoot, "agent", "agent.ts"),
    fileAvailable(webRoot, "package.json"),
    fileAvailable(webRoot, "node_modules", "next", "dist", "bin", "next"),
  ]);
  const webAvailable = webPackageAvailable && webRuntimeAvailable;

  console.log(`Data root: ${evecodeDataRoot()}`);
  console.log(`Default workspace: ${workspace}`);
  console.log(`Selected model: ${migrateModel(config.model)}`);
  console.log(`OPENAI_BASE_URL: ${process.env.OPENAI_BASE_URL?.trim() ? "configured" : "not configured"}`);
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY?.trim() ? "configured" : "not configured"}`);
  console.log(`TUI surface: ${tuiAvailable ? "available" : "unavailable"}`);
  console.log(`Web surface: ${webAvailable ? "available (source checkout)" : "unavailable in this install"}`);
}

async function main(): Promise<void> {
  const [command, argument, ...extra] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    if (argument !== undefined || extra.length > 0) {
      throw new Error("Help does not accept arguments.");
    }
    usage();
  }
  if (extra.length > 0) throw new Error(`Unexpected arguments: ${extra.join(" ")}`);
  if (command === "status") {
    if (argument !== undefined) throw new Error("status does not accept arguments.");
    await status();
    return;
  }
  if (command === "auth") {
    if (argument !== "status") throw new Error("Usage: evecode auth status");
    await status();
    return;
  }
  if (command === "model") {
    if (!argument) {
      console.log(migrateModel((await readConfig()).model));
      return;
    }
    const model = normalizeModel(argument);
    await setSelectedModel(model);
    console.log(`Selected model: ${model}`);
    return;
  }
  if (command === "models") {
    if (argument !== undefined) throw new Error("models does not accept arguments.");
    console.log(`Recommended model IDs:\n  ${MODELS.join("\n  ")}\n\nDefault: ${DEFAULT_MODEL}`);
    return;
  }
  if (command === "login") {
    if (argument !== undefined) throw new Error("login does not accept arguments.");
    console.log(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_BASE_URL?.trim()
      ? "OPENAI_BASE_URL and OPENAI_API_KEY are configured."
      : "Set OPENAI_BASE_URL and OPENAI_API_KEY in the environment before launching Evecode.");
    return;
  }
  if (command === "logout") {
    if (argument !== undefined) throw new Error("logout does not accept arguments.");
    console.log("Evecode does not store gateway credentials. Unset OPENAI_BASE_URL and OPENAI_API_KEY in the parent environment.");
    return;
  }
  throw new Error(`Unknown Evecode management command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
