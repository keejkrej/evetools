# Evedraw desktop

Evedraw desktop hosts the production Next.js standalone output inside Electron's Node process through the adjacent `next-electron-rsc` fork. Renderer requests are intercepted and dispatched to Next in-process; the app does not spawn a Node server or listen on a loopback port.

`pnpm dev:draw-desktop` runs the Electron development host. `pnpm --filter @evetools/draw-desktop build` creates the platform directory bundle in `dist/`.

During development, configuration is loaded from the repository-root `.env`. Packaged desktop apps share `~/.evetools/.env`.
Set `EVEDRAW_WEB_URL` to the public HTTPS Evedraw web deployment and allowlist `evedraw://callback` in Clerk's Native applications settings. Desktop authentication opens that deployment in the system browser and returns a short-lived, state-bound token through the registered app protocol.
