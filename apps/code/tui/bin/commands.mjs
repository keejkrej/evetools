const MANAGEMENT_COMMANDS = new Set([
  "login",
  "logout",
  "model",
  "models",
  "status",
  "auth",
  "help",
  "--help",
  "-h",
]);

function takeValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseTuiArguments(args, transitional) {
  let model;
  let workspace;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--model") {
      model = takeValue(args, index, "--model");
      index += 1;
    } else if (argument.startsWith("--model=")) {
      model = argument.slice("--model=".length);
      if (!model) throw new Error("--model requires a value");
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown TUI option: ${argument}`);
    } else if (workspace === undefined) {
      workspace = argument;
    } else {
      throw new Error("Expected at most one workspace path");
    }
  }
  return { kind: "tui", model, transitional, workspace };
}

function parseWebArguments(args) {
  let open = true;
  let port = 3000;
  let workspace;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--no-open") {
      open = false;
    } else if (argument === "--port") {
      port = Number(takeValue(args, index, "--port"));
      index += 1;
    } else if (argument.startsWith("--port=")) {
      port = Number(argument.slice("--port=".length));
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown web option: ${argument}`);
    } else if (workspace === undefined) {
      workspace = argument;
    } else {
      throw new Error("Expected at most one workspace path");
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("--port must be an integer from 1 to 65535");
  }
  return { kind: "web", open, port, workspace };
}

export function parseEvecodeCommand(args) {
  const [command, surface, ...rest] = args;
  if (command === "launch") {
    if (surface === "tui") {
      if (rest.length === 1 && (rest[0] === "--help" || rest[0] === "-h")) {
        return { kind: "management", args: ["help"] };
      }
      return parseTuiArguments(rest, false);
    }
    if (surface === "web") {
      if (rest.length === 1 && (rest[0] === "--help" || rest[0] === "-h")) {
        return { kind: "management", args: ["help"] };
      }
      return parseWebArguments(rest);
    }
    throw new Error("Usage: evecode launch <tui|web> [workspace]");
  }
  if (command && MANAGEMENT_COMMANDS.has(command)) {
    return { kind: "management", args };
  }
  return parseTuiArguments(args, true);
}

export function dispatchEvecodeCommand(command, handlers) {
  if (command.kind === "management") return handlers.management(command.args);
  if (command.kind === "web") return handlers.web(command);
  return handlers.tui(command);
}
