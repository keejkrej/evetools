import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";

export async function resolveLaunchWorkspace(
  requested,
  { env = process.env, cwd = process.cwd() } = {},
) {
  const configured = requested ?? (
    env.EVECODE_WORKSPACE_ROOT?.trim()
      || env.INIT_CWD?.trim()
      || cwd
  );
  const candidate = path.resolve(cwd, configured);
  try {
    await access(candidate, constants.R_OK | constants.W_OK);
    if (!(await stat(candidate)).isDirectory()) throw new Error("not a directory");
    return await realpath(candidate);
  } catch (error) {
    throw new Error(
      `Cannot use coding workspace ${candidate}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
