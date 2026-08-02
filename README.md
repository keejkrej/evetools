# Evetools

Evetools is a Turborepo for three deliberately separate agentic products:

- **Evechat** (`@evetools/chat`) — a focused conversational assistant with web and mobile interfaces
- **Evedraw** (`@evetools/draw`) — an agentic visual canvas with web and macOS desktop interfaces
- **Evecode** (`@evetools/code`) — an agentic coding product with web and desktop interfaces, inspired by Codex app and the UX of `../t3code`

The repository was seeded from the current merged `evechat` codebase. The obsolete standalone `evedraw` repository was not used. T3 Code is a product reference for Evecode, not an architectural template: Evetools uses only the first-party Eve agent harness.

## Repository shape

```text
apps/
  chat/
    web/             @evetools/chat
    mobile/          @evetools/chat-mobile
  draw/
    web/             @evetools/draw
    desktop/         @evetools/draw-desktop
  code/
    web/             @evetools/code
    desktop/         @evetools/code-desktop
packages/
  agent/             @evetools/agent
  ui/                @evetools/ui
```

`@evetools/agent` is the product-neutral Eve harness seam around the Vercel AI SDK. Products own their instructions, tools, persistence, and workflows. In particular, drawing contracts stay in Draw, while coding workspace, terminal, and selective `~/.agents/skills` loading stay in Code. Chat and Draw do not discover coding skills. Shared UI primitives and AI presentation modules live in `@evetools/ui`.

Evedraw owns a desktop target because drawing needs native access to local Excalidraw files. Evechat intentionally has no desktop target. Evecode has separate web and desktop interfaces and will use a simple Next.js plus native Eve app architecture rather than T3 Code's multi-harness architecture.

## Development

Node.js 22.13+ and pnpm are required.

```bash
pnpm install
cp apps/chat/web/.env.example apps/chat/web/.env.local
cp apps/draw/web/.env.example apps/draw/web/.env.local
cp apps/code/web/.env.example apps/code/web/.env.local
# Set EVECODE_WORKSPACE_ROOT to the local project Evecode may access.
pnpm dev:chat
pnpm dev:chat-mobile
pnpm dev:draw
pnpm dev:draw-desktop
pnpm dev:code
pnpm dev:code-desktop
```

Turbo also supports `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm check` across the workspace.

Evecode's current coding tools can read and write files and execute shell commands inside `EVECODE_WORKSPACE_ROOT`. Run it locally and do not expose its Next.js server publicly.
