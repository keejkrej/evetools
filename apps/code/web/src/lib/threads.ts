import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { workspaceRoot } from "./workspace";

const toolSchema = z.object({
  type: z.literal("tool"),
  id: z.string(),
  name: z.string(),
  title: z.string().optional(),
  status: z.enum(["running", "complete", "error"]),
  input: z.unknown().optional(),
});

export const messageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(500_000),
  reasoning: z.string().max(500_000).optional(),
  tools: z.array(toolSchema).max(200).optional(),
  turnId: z.string().uuid().optional(),
  turnStatus: z.enum(["running", "completed", "stopped", "failed"]).optional(),
  startedAt: z.number().int().nonnegative().optional(),
  completedAt: z.number().int().nonnegative().optional(),
});

export const threadSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  messages: z.array(messageSchema).max(500),
  updatedAt: z.number().int().nonnegative(),
  status: z.enum(["idle", "working", "error"]),
});

export type CodeThread = z.infer<typeof threadSchema>;

type ThreadStore = { version: 1; threads: CodeThread[] };
let writeQueue = Promise.resolve();

export function newCodeThread(): CodeThread {
  return {
    id: randomUUID(),
    title: "New thread",
    messages: [],
    updatedAt: Date.now(),
    status: "idle",
  };
}

export function threadStorePath(): string {
  const dataRoot = path.resolve(process.env.EVECODE_DATA_ROOT ?? path.join(os.homedir(), ".evecode"));
  const workspaceKey = createHash("sha256").update(workspaceRoot()).digest("hex").slice(0, 16);
  return path.join(dataRoot, "workspaces", workspaceKey, "threads.json");
}

async function readStore(): Promise<ThreadStore> {
  const file = threadStorePath();
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    const threads = z.array(threadSchema).parse(parsed?.threads).map((thread) => {
      if (thread.status !== "working" && !thread.messages.some((message) => message.turnStatus === "running")) return thread;
      const interruptedAt = Date.now();
      return {
        ...thread,
        status: "idle" as const,
        messages: thread.messages.map((message) => message.turnStatus === "running"
          ? { ...message, turnStatus: "stopped" as const, completedAt: interruptedAt }
          : message),
      };
    });
    return { version: 1, threads };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, threads: [] };
    throw new Error(`Could not read Evecode threads: ${error instanceof Error ? error.message : "invalid data"}`);
  }
}

async function writeStore(store: ThreadStore): Promise<void> {
  const file = threadStorePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, file);
}

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function listThreads(): Promise<CodeThread[]> {
  const { threads } = await readStore();
  return threads.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function replaceThreads(input: unknown): Promise<CodeThread[]> {
  const threads = z.array(threadSchema).max(200).parse(input);
  return serializeWrite(async () => {
    await writeStore({ version: 1, threads });
    return threads;
  });
}

export async function saveThread(input: unknown): Promise<CodeThread> {
  const thread = threadSchema.parse(input);
  return serializeWrite(async () => {
    const store = await readStore();
    const index = store.threads.findIndex((item) => item.id === thread.id);
    if (index < 0) store.threads.push(thread);
    else store.threads[index] = thread;
    await writeStore(store);
    return thread;
  });
}

export async function deleteThread(id: string): Promise<boolean> {
  return serializeWrite(async () => {
    const store = await readStore();
    const remaining = store.threads.filter((thread) => thread.id !== id);
    if (remaining.length === store.threads.length) return false;
    await writeStore({ version: 1, threads: remaining });
    return true;
  });
}
