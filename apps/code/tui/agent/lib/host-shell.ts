export type HostShellInvocation = {
  command: string;
  args: string[];
};

export function hostShellInvocation(
  script: string,
  options: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv } = {},
): HostShellInvocation {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  if (platform === "win32") {
    return {
      command: env.ComSpec?.trim() || env.COMSPEC?.trim() || "cmd.exe",
      args: ["/d", "/s", "/c", script],
    };
  }
  return {
    command: env.SHELL?.trim() || "/bin/sh",
    args: ["-lc", script],
  };
}
