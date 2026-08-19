# Evecode TUI release testing

A release must be exercised from the packed workspace package, not only from the Evetools checkout. The command builds its Eve runtime on first launch, so the packed source and the Git-based Eve dependency are both part of the release surface.

## Source checks

From the Evetools root with Node.js 24 or newer:

```sh
pnpm --filter @evetools/code-tui typecheck
pnpm --filter @evetools/code-tui test
pnpm --filter @evetools/code-tui build
```

Confirm `.output/` is generated but remains ignored, and review the complete source diff.

## Pack and install

Pack the TUI package and install that exact archive with pnpm. The pinned Eve dependency uses pnpm's Git-repository subdirectory syntax, so npm and Yarn are not supported installers until the fork is published as a standalone package. Eve is an explicit peer: install the archive and exact fork together so pnpm does not have to permit an exotic transitive dependency. `tsx` uses esbuild, so approve only that package's install script. Verify both bin names resolve to the same launcher:

```sh
PACK_DIR="$(mktemp -d)"
pnpm --filter @evetools/code-tui pack --pack-destination "$PACK_DIR"
pnpm add --global --allow-build=esbuild \
  "$PACK_DIR"/*.tgz \
  'https://github.com/keejkrej/eve.git#82a4c974346f4237dcb6d3a961f9242d16add108&path:/packages/eve'
evecode --help
eve-agent --help
```

The transitional `eve-agent` alias must remain behaviorally identical, but release documentation and normal workflows should use `evecode`.

## Startup and conversation

From a disposable Git repository, start `evecode launch tui .`. It must build automatically if the package contains no `.output`, bind its server only to `127.0.0.1`, open the Evecode TUI, and report the selected model in both the footer and `/eve/v1/info`. Confirm the transitional direct form `evecode .` reaches the same TUI.

In an Evetools source checkout, run `evecode launch web --no-open .` and verify the Next server binds only to `127.0.0.1` with the same resolved workspace. A packed TUI-only install must instead explain that the web surface is unavailable; it must not silently launch another surface. Both surfaces use only `OPENAI_BASE_URL` and `OPENAI_API_KEY`.

Complete two turns in one session and assert assistant output rather than echoed input. Exercise `/model`, `/compact`, `/reset`, cancellation, one safe file edit, one rejected traversal, and one approval-gated shell command.

## Gateway model matrix

Run the two-turn check through the OpenAI-compatible gateway with at least two models from the shared catalog, in this product order:

- `chatgpt/gpt-5.6-luna`
- `chatgpt/gpt-5.6-terra`
- `grok/grok-code` (Code/TUI default)
- `grok/grok-4.6`
- `cursor/composer-2.5`

Verify `evecode status` reports only whether `OPENAI_BASE_URL` and `OPENAI_API_KEY` are configured and never prints their values.

## Upgrade compatibility

Install the prior release and select a model. Install the candidate and verify:

- a legacy model setting is normalized to a curated gateway model ID and the environment key is used;
- `evecode` starts in the same repository;
- new state is written under `EVECODE_DATA_ROOT`/`~/.evecode` once explicitly configured;
- neither source checkout nor package upgrade requires a `node_modules` patch.

Record the packed artifact path and TUI logs in the release handoff. Do not tag or publish until the complete matrix passes.
