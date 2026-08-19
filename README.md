# Evetools

Evetools is a Turborepo for three deliberately separate agentic products:

- **Evechat** (`@evetools/chat`) — a focused conversational assistant with web and mobile interfaces
- **Evedraw** (`@evetools/draw`) — an agentic visual canvas with a web interface
- **Evecode** — an agentic coding product with web (`@evetools/code`) and terminal (`@evetools/code-tui`) interfaces, inspired by Codex app and the UX of `../t3code`

The repository was seeded from the current merged `evechat` codebase. The obsolete standalone `evedraw` repository was not used. T3 Code is a product reference for Evecode, not an architectural template. Evecode's web and terminal interfaces both run the same authored agent on the first-party [eve](https://eve.dev) runtime; Chat and Draw use the Vercel AI SDK. Every product sends model traffic through an OpenAI-compatible gateway (`OPENAI_BASE_URL` + `OPENAI_API_KEY`), typically [subproxy](../subproxy).

## Repository shape

```text
apps/
  chat/
    web/             @evetools/chat
    mobile/          @evetools/chat-mobile
  draw/
    web/             @evetools/draw
  code/
    web/             @evetools/code
    tui/             @evetools/code-tui
packages/
  agent/             @evetools/agent
  drawing/           @evetools/drawing
  evebind/           @evetools/evebind
  models/            @evetools/models
  ui/                @evetools/ui
```

`@evetools/evebind` is a protein-binder design orchestrator (not a generative model): it plans Anthropic-style de novo miniprotein campaigns, writes command templates for published structure/sequence/co-fold tools, and ranks already-computed scores. It does not run GPUs, download weights, or invent residues.

`@evetools/models` owns the curated model catalog and the OpenAI-compatible client used across product selectors. `@evetools/drawing` owns Evedraw's editor-neutral `eve.design/v1` session contract, schemas, faults, and in-memory conformance adapter. `@evetools/agent` is the product-neutral event-stream seam used by Chat and Draw. Evecode's authored agent, instructions, model policy, tools, approvals, and durable session protocol live once under `apps/code/tui`; Next.js and the terminal are UI adapters over that core. Shared UI primitives and AI presentation modules live in `@evetools/ui`.

## Development

Node.js 24+ and pnpm are required.

```bash
pnpm install
cp .env.example .env
cp apps/chat/mobile/.env.example apps/chat/mobile/.env.local
# Add OPENAI_BASE_URL and OPENAI_API_KEY.
pnpm dev:chat
pnpm dev:chat-mobile
pnpm dev:draw
pnpm evecode launch web
pnpm evecode launch tui /path/to/a/repository
pnpm evecode status
```

Turbo also supports `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm check` across the workspace.

Server and CLI development commands load the repository-level `.env`. Evechat
mobile deliberately reads its public-only package-local `.env.local` so Expo
does not inherit server credentials. Evecode exposes both product surfaces
through one command: `evecode launch web` opens the Next.js interface, while
`evecode launch tui` starts the terminal interface. The same command owns
login, model selection, and status; see [`apps/code/tui`](apps/code/tui) for
details and release instructions.

Model selectors expose a small, tool-capable shortlist rather than the gateway's full catalog. The apps refresh availability from `/v1/models` while keeping the curated order stable.

Evechat mobile uses the same Clerk owner identity as the web app. Set
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and a device-reachable
`EXPO_PUBLIC_API_URL`; see [`apps/chat/mobile`](apps/chat/mobile) for native
registration and physical-device networking details. Provider and Clerk secret
keys remain on the web deployment.

Evecode's shared coding tools can read and write files and execute shell commands inside the workspace selected by either launch command. Both interfaces use positional path → `EVECODE_WORKSPACE_ROOT` → `INIT_CWD` → current directory, and the launcher passes the same canonical root to the agent and UI. Run these interfaces locally and do not expose the Next.js server publicly.
