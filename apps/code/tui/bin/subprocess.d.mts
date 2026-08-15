export type NodeInvocation = {
  command: string;
  args: string[];
};

export function eveInvocation(agentRoot: string, args: string[]): NodeInvocation;
export function tsxInvocation(agentRoot: string, args: string[]): NodeInvocation;
