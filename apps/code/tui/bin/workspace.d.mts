export function resolveLaunchWorkspace(
  requested?: string,
  options?: { env?: NodeJS.ProcessEnv; cwd?: string },
): Promise<string>;
