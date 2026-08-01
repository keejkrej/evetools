import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteThread, listThreads, newCodeThread, replaceThreads, saveThread, threadStorePath } from "./threads";

let root = "";
let dataRoot = "";
const originalWorkspaceRoot = process.env.EVECODE_WORKSPACE_ROOT;
const originalDataRoot = process.env.EVECODE_DATA_ROOT;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "evecode-thread-workspace-"));
  dataRoot = await mkdtemp(path.join(tmpdir(), "evecode-thread-data-"));
  process.env.EVECODE_WORKSPACE_ROOT = root;
  process.env.EVECODE_DATA_ROOT = dataRoot;
});

afterEach(async () => {
  if (originalWorkspaceRoot === undefined) delete process.env.EVECODE_WORKSPACE_ROOT;
  else process.env.EVECODE_WORKSPACE_ROOT = originalWorkspaceRoot;
  if (originalDataRoot === undefined) delete process.env.EVECODE_DATA_ROOT;
  else process.env.EVECODE_DATA_ROOT = originalDataRoot;
  await Promise.all([rm(root, { recursive: true, force: true }), rm(dataRoot, { recursive: true, force: true })]);
});

describe("durable thread storage", () => {
  it("stores threads outside the workspace and reads them newest-first", async () => {
    const older = { ...newCodeThread(), title: "Older", updatedAt: 1 };
    const newer = { ...newCodeThread(), title: "Newer", updatedAt: 2 };
    await saveThread(older);
    await saveThread(newer);

    expect(threadStorePath().startsWith(dataRoot)).toBe(true);
    expect(threadStorePath().startsWith(root)).toBe(false);
    await expect(listThreads()).resolves.toEqual([newer, older]);
    await expect(readFile(threadStorePath(), "utf8")).resolves.toContain('"version": 1');
  });

  it("imports a complete browser thread collection", async () => {
    const threads = [{ ...newCodeThread(), title: "Imported" }];
    await expect(replaceThreads(threads)).resolves.toEqual(threads);
    await expect(listThreads()).resolves.toEqual(threads);
  });

  it("normalizes interrupted working threads after restart", async () => {
    const working = { ...newCodeThread(), status: "working" as const };
    await saveThread(working);
    await expect(listThreads()).resolves.toMatchObject([{ id: working.id, status: "idle" }]);
  });

  it("updates and deletes a thread", async () => {
    const thread = newCodeThread();
    await saveThread(thread);
    await saveThread({ ...thread, title: "Renamed" });
    await expect(listThreads()).resolves.toMatchObject([{ id: thread.id, title: "Renamed" }]);
    await expect(deleteThread(thread.id)).resolves.toBe(true);
    await expect(deleteThread(thread.id)).resolves.toBe(false);
    await expect(listThreads()).resolves.toEqual([]);
  });
});
