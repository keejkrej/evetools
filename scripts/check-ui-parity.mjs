import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const readJson = async (relativePath) => JSON.parse(await read(relativePath));

const sharedImport = '@import "@evetools/chat-shell/globals.css";';
for (const app of ["chat", "draw"]) {
  const globals = (await read(`apps/${app}/web/src/app/globals.css`)).trim();
  assert.equal(globals, sharedImport, `${app} must consume the shared shell stylesheet`);

  const manifest = await readJson(`apps/${app}/web/package.json`);
  assert.equal(
    manifest.dependencies["@evetools/chat-shell"],
    "workspace:*",
    `${app} must consume the shared shell package`,
  );

  const layout = await read(`apps/${app}/web/src/app/layout.tsx`);
  assert.match(layout, /@evetools\/chat-shell\/theme-provider/);

  const loginView = await read(`apps/${app}/web/src/app/login/login-view.tsx`);
  assert.match(loginView, /@evetools\/chat-shell\/login-view/);
}

const chatWrapper = await read("apps/chat/web/src/components/chat.tsx");
assert.match(chatWrapper, /import \{ ChatShell \} from "@evetools\/chat-shell"/);
assert.match(chatWrapper, /return <ChatShell \/>/);

const drawWrapper = await read("apps/draw/web/src/components/chat.tsx");
assert.match(drawWrapper, /ChatShell[\s\S]*storageNamespace="evedraw"/);
assert.match(drawWrapper, /<BoardPanel \/>/);

console.log("UI parity invariants passed");
