import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  migrateModel,
  normalizeModel,
  MODELS,
} from "./models.mjs";

/** @typedef {import("eve/tui").DevelopmentTuiModelCommandInput} DevelopmentTuiModelCommandInput */
/**
 * @typedef {object} EvecodeSettings
 * @property {number=} version
 * @property {string=} model
 * @property {string=} reasoning
 */

const MODEL_OPTIONS = MODELS.map((value) => ({
  value,
  label: value,
  description: "OpenAI-compatible · tool calling",
}));
const REASONING_OPTIONS = ["provider-default", "none", "minimal", "low", "medium", "high", "xhigh"];

function dataRoot() {
  return path.resolve(
    process.env.EVECODE_DATA_ROOT?.trim()
      || process.env.EVE_AGENT_HOME?.trim()
      || path.join(os.homedir(), ".evecode"),
  );
}

function hasExplicitDataRoot() {
  return Boolean(
    process.env.EVECODE_DATA_ROOT?.trim()
      || process.env.EVE_AGENT_HOME?.trim(),
  );
}

function configPath() {
  return path.join(dataRoot(), "config.json");
}

/** @returns {Promise<EvecodeSettings>} */
async function readConfig() {
  const legacy = path.join(os.homedir(), ".config", "eve-agent", "config.json");
  const files = [configPath(), ...(!hasExplicitDataRoot() ? [legacy] : [])];
  for (const file of [...new Set(files)]) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") throw error;
    }
  }
  return { version: 1 };
}

/** @param {EvecodeSettings} config */
async function writeConfig(config) {
  const normalized = {
    version: 1,
    ...(config.model ? { model: normalizeModel(config.model) } : {}),
    ...(config.reasoning ? { reasoning: config.reasoning } : {}),
  };
  const file = configPath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(file), 0o700).catch(() => undefined);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600).catch(() => undefined);
  const settingsChanged = /** @type {Record<PropertyKey, unknown>} */ (globalThis)[
    Symbol.for("evecode/settings-changed")
  ];
  if (typeof settingsChanged === "function") await settingsChanged(normalized);
}

/** @param {EvecodeSettings} draft */
function summary(draft) {
  return `${migrateModel(draft.model)}@${draft.reasoning ?? "high"}`;
}

/**
 * @param {string | undefined} serverUrl
 * @returns {Promise<{ model?: { reasoning?: string; routing?: { kind?: string } } } | undefined>}
 */
async function readLiveAgent(serverUrl) {
  if (!serverUrl) return undefined;
  try {
    const response = await fetch(new URL("/eve/v1/info", serverUrl), {
      signal: AbortSignal.timeout(1_500),
    });
    if (response.ok) {
      return /** @type {{ agent?: { model?: { reasoning?: string; routing?: { kind?: string } } } }} */ (
        await response.json()
      ).agent;
    }
  } catch {
    // The local server may be between generations.
  }
}

/** @param {string | undefined} serverUrl @param {EvecodeSettings} draft */
async function waitForRebuild(serverUrl, draft) {
  if (!serverUrl) return false;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const agent = await readLiveAgent(serverUrl);
    if (
      agent?.model?.routing?.kind === "dynamic"
      && agent.model.reasoning === draft.reasoning
    ) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/** @param {DevelopmentTuiModelCommandInput} input */
export async function runEvecodeModelFlow({ prompter, argument = "", serverUrl }) {
  const current = await readConfig();
  const draft = {
    model: migrateModel(current.model),
    reasoning: current.reasoning ?? "high",
  };
  const save = async () => {
    await writeConfig(draft);
    const rebuilt = await waitForRebuild(serverUrl, draft);
    return rebuilt
      ? `Selected ${summary(draft)}.`
      : `Selected ${summary(draft)}. Evecode is still restarting; the footer will update shortly.`;
  };
  if (argument.trim()) {
    draft.model = normalizeModel(argument.trim());
    return save();
  }
  for (;;) {
    const row = await prompter.select({
      message: `Model settings · ${summary(draft)}`,
      options: [
        { value: "model", label: "Model", hint: draft.model },
        { value: "reasoning", label: "Thinking level", hint: draft.reasoning },
        { value: "done", label: "Done" },
      ],
      initialValue: "model",
    });
    if (row === "model") {
      draft.model = await prompter.select({
        message: "Choose a model",
        options: MODEL_OPTIONS,
        initialValue: draft.model,
        search: true,
        placeholder: "filter model IDs",
      });
    } else if (row === "reasoning") {
      draft.reasoning = await prompter.select({
        message: "Thinking level",
        options: REASONING_OPTIONS.map((value) => ({ value, label: value })),
        initialValue: draft.reasoning,
      });
    } else {
      return save();
    }
  }
}
