# Evecode web

The Next.js interface for `@evetools/code`. It provides a Codex-style local coding workflow through the first-party `@evetools/agent` harness.

## Run locally

```bash
cp apps/code/web/.env.example apps/code/web/.env.local
# Set CURSOR_API_KEY and an absolute EVECODE_WORKSPACE_ROOT.
pnpm dev:code
```

The configured workspace is intentionally the only project root available to Eve. The current vertical slice includes durable server-side threads, structured turn lifecycle records, streaming text/reasoning/tool activity, interruption, workspace file inspection, writes, shell commands, Git diff review, and an approval gate for mutating tools.

Threads are stored per workspace under `~/.evecode/workspaces` using atomic file replacement. Set `EVECODE_DATA_ROOT` to use another application-data directory. Existing browser-local threads are imported automatically when the server-side store is empty. Every assistant turn records a stable turn ID, lifecycle status, start time, completion time, and duration. Turns interrupted by a process or app restart are marked as stopped when restored.

Multiple threads can work simultaneously. Starting a turn no longer locks navigation or other threads; each running thread owns its own cancellation controller and can be stopped independently from the sidebar or composer.

The composer defaults to **Ask** permission mode. In this mode, Eve pauses and requests explicit approval before replacing a file or running a shell command. **Trusted** mode allows those tools to execute without prompting and should only be used for tasks and workspaces you trust.

Evecode also discovers coding skills from `~/.agents/skills` by default. Only skill names and descriptions enter the system prompt. Eve loads the complete `SKILL.md`, or a referenced file confined to that skill's directory, through `load_skill` only when the task matches. Set `EVECODE_SKILLS_ROOT` to override the location for development or testing.

This is local-development software: the coding tools can modify files and run shell commands inside `EVECODE_WORKSPACE_ROOT`. Do not expose this server publicly.
