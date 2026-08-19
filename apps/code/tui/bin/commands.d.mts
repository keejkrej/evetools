export type ManagementCommand = { kind: "management"; args: string[] };
export type TuiCommand = {
  kind: "tui";
  model?: string;
  transitional: boolean;
  workspace?: string;
};
export type WebCommand = {
  kind: "web";
  open: boolean;
  port: number;
  workspace?: string;
};
export type EvecodeCommand = ManagementCommand | TuiCommand | WebCommand;

export function parseEvecodeCommand(args: string[]): EvecodeCommand;
export function dispatchEvecodeCommand<T>(
  command: EvecodeCommand,
  handlers: {
    management(args: string[]): T | Promise<T>;
    tui(command: TuiCommand): T | Promise<T>;
    web(command: WebCommand): T | Promise<T>;
  },
): T | Promise<T>;
