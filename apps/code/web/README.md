# Evecode web

The Next.js interface for `@evetools/code`. It provides a Codex-style local coding workflow through the first-party `@evetools/agent` harness.

## Run locally

```bash
cp apps/code/web/.env.example apps/code/web/.env.local
# Set CURSOR_API_KEY and an absolute EVECODE_WORKSPACE_ROOT.
pnpm dev:code
```

The configured workspace is intentionally the only project root available to Eve. The current vertical slice includes persistent local threads, streaming text/reasoning/tool activity, interruption, workspace file inspection, writes, shell commands, and Git diff review.

Evecode also discovers coding skills from `~/.agents/skills` by default. Only skill names and descriptions enter the system prompt. Eve loads the complete `SKILL.md`, or a referenced file confined to that skill's directory, through `load_skill` only when the task matches. Set `EVECODE_SKILLS_ROOT` to override the location for development or testing.

This is local-development software: the coding tools can modify files and run shell commands inside `EVECODE_WORKSPACE_ROOT`. Do not expose this server publicly.
