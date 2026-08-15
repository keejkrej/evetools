import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataReadPaths, evecodeDataRoot } from "../config.js";

export type ReasoningLevel = "provider-default" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type ConfigFile = { version: 1; model?: string; reasoning?: ReasoningLevel };

export function configFilePath(): string {
  return path.join(evecodeDataRoot(), "config.json");
}

export async function readConfig(): Promise<ConfigFile> {
  for (const file of dataReadPaths("config.json")) {
    try {
      return JSON.parse(await readFile(file, "utf8")) as ConfigFile;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw new Error(`Cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { version: 1 };
}

export async function writeConfig(config: ConfigFile): Promise<void> {
  const normalized: ConfigFile = {
    version: 1,
    ...(config.model ? { model: config.model } : {}),
    ...(config.reasoning ? { reasoning: config.reasoning } : {}),
  };
  const file = configFilePath();
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600).catch(() => undefined);
  const settingsChanged = (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("evecode/settings-changed")
  ];
  if (typeof settingsChanged === "function") await settingsChanged(normalized);
}

export async function setSelectedModel(model: string | undefined): Promise<void> {
  const config = await readConfig();
  if (model) config.model = model;
  else delete config.model;
  await writeConfig(config);
}
