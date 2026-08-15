import { createRequire } from "node:module";
import path from "node:path";

function packageRequire(agentRoot) {
  return createRequire(path.join(agentRoot, "package.json"));
}

export function eveInvocation(agentRoot, args) {
  const require = packageRequire(agentRoot);
  const packageRoot = path.dirname(require.resolve("eve/package.json"));
  return {
    command: process.execPath,
    args: [path.join(packageRoot, "bin", "eve.js"), ...args],
  };
}

export function tsxInvocation(agentRoot, args) {
  const require = packageRequire(agentRoot);
  return {
    command: process.execPath,
    args: [require.resolve("tsx/cli"), ...args],
  };
}
