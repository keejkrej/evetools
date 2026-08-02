# Evedraw desktop

Evedraw desktop hosts the production Next.js standalone output inside Electron's Node process through the adjacent `next-electron-rsc` fork. Renderer requests are intercepted and dispatched to Next in-process; the app does not spawn a Node server or listen on a loopback port.

`pnpm dev:draw-desktop` runs the Electron development host. `pnpm --filter @evetools/draw-desktop build` creates the platform directory bundle in `dist/`.

During development, configuration is loaded from the repository-root `.env`. Packaged desktop apps share `~/.evetools/.env`.
Desktop authentication temporarily exposes the same in-process Next handler at `127.0.0.1:43117`, opens it in the system browser, and returns a short-lived, state-bound token through `evedraw://callback`. The listener closes after authentication; no child Node process or persistent HTTP backend is started.
