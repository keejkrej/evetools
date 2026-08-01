export type CodeDesktopCapability =
  | "filesystem"
  | "process"
  | "terminal"
  | "workspace";

export const codeDesktopProduct = {
  id: "evecode",
  name: "Evecode",
  interface: "desktop",
  status: "scaffold",
  capabilities: ["filesystem", "process", "terminal", "workspace"],
} as const satisfies {
  id: string;
  name: string;
  interface: "desktop";
  status: "scaffold";
  capabilities: readonly CodeDesktopCapability[];
};
