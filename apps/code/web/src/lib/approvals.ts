import { randomUUID } from "node:crypto";

export type ApprovalKind = "write_file" | "run_command";
export type ApprovalRequest = {
  id: string;
  threadId: string;
  kind: ApprovalKind;
  title: string;
  detail: string;
  createdAt: number;
};

type PendingApproval = ApprovalRequest & {
  resolve: (approved: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
  removeAbortListener?: () => void;
};

const pending = new Map<string, PendingApproval>();
const APPROVAL_TIMEOUT_MS = 5 * 60_000;

function settle(id: string, approved: boolean): boolean {
  const approval = pending.get(id);
  if (!approval) return false;
  pending.delete(id);
  clearTimeout(approval.timeout);
  approval.removeAbortListener?.();
  approval.resolve(approved);
  return true;
}

export function listApprovals(threadId: string): ApprovalRequest[] {
  return [...pending.values()]
    .filter((approval) => approval.threadId === threadId)
    .map(({ resolve: _resolve, timeout: _timeout, removeAbortListener: _remove, ...approval }) => approval)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function decideApproval(id: string, approved: boolean): boolean {
  return settle(id, approved);
}

export function requestApproval(
  request: Omit<ApprovalRequest, "id" | "createdAt">,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);

  return new Promise((resolve) => {
    const id = randomUUID();
    const timeout = setTimeout(() => settle(id, false), APPROVAL_TIMEOUT_MS);
    const approval: PendingApproval = {
      ...request,
      id,
      createdAt: Date.now(),
      resolve,
      timeout,
    };

    if (signal) {
      const abort = () => settle(id, false);
      signal.addEventListener("abort", abort, { once: true });
      approval.removeAbortListener = () => signal.removeEventListener("abort", abort);
    }

    pending.set(id, approval);
  });
}
