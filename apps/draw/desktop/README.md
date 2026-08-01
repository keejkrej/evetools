# Evedraw desktop

The native launcher packages the Evedraw Next.js app, validates `~/.evedraw/.env`, starts its standalone server on loopback, and embeds it in a persistent WKWebView. `app.zon` is pinned to Native SDK 0.7.0.

Useful commands from the repository root:

```bash
pnpm dev:evedraw-desktop
pnpm --filter @evetools/draw-desktop stage
pnpm --filter @evetools/draw-desktop validate
pnpm --filter @evetools/draw-desktop build
pnpm --filter @evetools/draw-desktop package
```

Packaging produces `apps/draw/desktop/dist/Evedraw.app`. Signing credentials are deliberately external; replace the final ad-hoc signature with hardened-runtime Developer ID signing and notarization for distribution.
