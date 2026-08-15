# Evecode TUI

This package is Evecode's terminal interface. It runs the first-party [eve](https://eve.dev) TUI against a local Evecode agent while exposing one selected host repository through workspace-scoped coding tools.

## Run locally

Evecode TUI requires Node.js 24 or newer and supports macOS, Linux, and Windows. Shell tools use the host's configured shell. Git and [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) must be available on `PATH`; Evecode uses them for repository state, file listing, and text search. From the Evetools repository:

```sh
pnpm install
pnpm --filter @evetools/code-tui agent -- launch tui .
```

The installed command is `evecode`; `eve-agent` remains as a temporary binary alias. The unified launcher exposes the two Evecode surfaces from a source checkout:

```sh
evecode launch tui [workspace]
evecode launch web [--port 3000] [--no-open] [workspace]
evecode status
```

Packed installs currently require pnpm because the pinned Eve fork is consumed from a Git-repository subdirectory. Install the TUI archive and its exact Eve peer together; this keeps the Git dependency explicit at the top level instead of weakening pnpm's exotic-subdependency protection. The release checklist contains the complete command.

Running `evecode [--model provider/model] [workspace]` directly remains a transitional alias for `evecode launch tui`.

Set the one provider credential before starting either surface, then optionally choose another curated model:

```sh
export OPENROUTER_API_KEY=...
evecode model xiaomi/mimo-v2.5
```

In PowerShell, set the same process environment variable with
`$env:OPENROUTER_API_KEY = "..."`.

OpenRouter is the sole model provider. Evecode reads `OPENROUTER_API_KEY` from the process environment and never reads shell startup files or stores the key. `evecode login` only reports whether that environment variable is present.

Model settings live under `EVECODE_DATA_ROOT`, which defaults to `~/.evecode`. With no explicit data-root variable, config reads fall back to the former default `~/.config/eve-agent`; writes migrate to `~/.evecode`. Setting `EVECODE_DATA_ROOT` or legacy `EVE_AGENT_HOME` isolates reads and writes to that explicit directory.

Run against the current repository or select another writable directory:

```sh
evecode launch tui
evecode launch tui /path/to/repository
evecode launch tui --model xiaomi/mimo-v2.5 .
```

Both launch surfaces resolve the workspace in the same order: positional path, `EVECODE_WORKSPACE_ROOT`, `INIT_CWD`, then the current directory. The launcher passes that one required, resolved writable directory to the shared agent and the selected UI. Starting the web package directly without `EVECODE_WORKSPACE_ROOT` fails with setup guidance instead of silently choosing a different directory.

## Web surface

`evecode launch web` locates the sibling `apps/code/web` package, starts its local Next server on `127.0.0.1`, and opens it after the server is ready. Pass `--no-open` for headless use. It receives the same resolved workspace and `OPENROUTER_API_KEY` as the TUI.

The web app is not bundled into `@evetools/code-tui`. A packed/global TUI install therefore reports a clear error for `launch web`; run that surface from the Evetools source checkout. The web UI mounts this same authored eve agent and durable session protocol instead of maintaining a second model loop. `evecode status` reports the resolved data root and default workspace, selected OpenRouter model, key presence, and which surfaces this install can launch.

## TUI commands

- `/model` configures the OpenRouter model ID and thinking level.
- `/traces` opens the local trace viewer.
- `/compact` compacts a long session.
- `/clear`, `/new`, and `/reset` manage conversation state.
- `/cancel` stops the running turn.
- `/help` lists all commands.

## Host access and approvals

The authored `bash`, `read_file`, `write_file`, `edit_file`, `glob`, and `grep` tools run in the Evecode process with the user's host permissions. File tools reject traversal and symlink escapes; edits and replacements require approval in both interfaces. `bash` intentionally runs in the selected repository but can technically reach beyond it; destructive or external command patterns require approval.

Use this interface only with repositories you trust.

## Development and release

```sh
pnpm --filter @evetools/code-tui typecheck
pnpm --filter @evetools/code-tui test
pnpm --filter @evetools/code-tui build
```

The TUI launcher builds `.output` automatically when a source installation has no compatible compiled runtime, and rebuilds when settings that affect the compiled agent change. Generated output is intentionally not committed.

See [docs/release-testing.md](docs/release-testing.md) for the packaged-command release gate.
