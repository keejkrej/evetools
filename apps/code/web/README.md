# Evecode web

The browser interface for Evecode. It is a Next.js adapter over the same eve
agent used by `evecode launch tui`: the agent definition, instructions, model
policy, tools, workspace confinement, approvals, and durable session protocol
all live in `../tui`.

## Run locally

```bash
# From the repository root, copy .env.example to .env and set OPENAI_BASE_URL and OPENAI_API_KEY.
pnpm evecode launch web
```

`evecode launch web [workspace]` selects the same host workspace as
`evecode launch tui [workspace]`. The coding tools can edit files and run host
commands there, so do not expose this local-development server publicly.
The shared agent and read-only workspace explorer both require the launcher's
resolved `EVECODE_WORKSPACE_ROOT`; neither silently falls back to another
directory.

The model picker sends a curated gateway model as ephemeral Eve client
context for each turn. The shared agent validates the choice and creates the
model; the web interface never runs a separate model loop.

Conversation execution and continuation are owned by Eve's durable sessions.
The browser persists only the fixed Eve session identity, then replays its
authoritative durable event stream after a reload. It does not maintain a
second event, thread, or turn store. "New session" discards that identity. Tool
approvals and questions use Eve's standard human-in-the-loop events and resume
protocol.

The Changes panel is a read-only web adapter for browsing the selected
workspace. Agent file edits, shell execution, Git inspection, and cancellation
all use the shared authored tools in `../tui/agent`.
