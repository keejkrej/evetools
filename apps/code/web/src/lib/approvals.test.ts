import { describe, expect, it } from "vitest";
import { decideApproval, listApprovals, requestApproval } from "./approvals";

const request = (threadId: string, signal?: AbortSignal) => requestApproval({
  threadId,
  kind: "run_command",
  title: "Run shell command",
  detail: "pnpm test",
}, signal);

describe("approval broker", () => {
  it("isolates pending approvals by thread and resolves an approval", async () => {
    const decision = request("thread-a");
    expect(listApprovals("thread-b")).toEqual([]);
    const [approval] = listApprovals("thread-a");
    expect(approval).toMatchObject({ threadId: "thread-a", detail: "pnpm test" });
    expect(decideApproval(approval.id, true)).toBe(true);
    await expect(decision).resolves.toBe(true);
    expect(listApprovals("thread-a")).toEqual([]);
  });

  it("resolves false when denied", async () => {
    const decision = request("thread-denied");
    const [approval] = listApprovals("thread-denied");
    decideApproval(approval.id, false);
    await expect(decision).resolves.toBe(false);
  });

  it("cancels a pending approval when its turn is aborted", async () => {
    const controller = new AbortController();
    const decision = request("thread-stopped", controller.signal);
    controller.abort();
    await expect(decision).resolves.toBe(false);
    expect(listApprovals("thread-stopped")).toEqual([]);
  });
});
