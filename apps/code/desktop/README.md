# Evecode desktop

Evecode desktop hosts the production Next.js standalone output inside Electron's Node process through the adjacent `next-electron-rsc` fork. Renderer requests are intercepted and dispatched to Next in-process; the app does not spawn a Node server or listen on a loopback port.

`pnpm dev:code-desktop` runs the Electron development host. `pnpm --filter @evetools/code-desktop build` creates the platform directory bundle in `dist/`.
