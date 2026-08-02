import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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

const desktopFiles = await readdir(path.join(root, "apps/draw/desktop"), {
  recursive: true,
});
const presentationFiles = desktopFiles.filter(
  (file) =>
    !/^(node_modules|build|dist)[\\/]/.test(file) &&
    /\.(css|html|tsx)$/.test(file),
);
assert.deepEqual(
  presentationFiles,
  [],
  `Draw desktop must not contain presentation files: ${presentationFiles.join(", ")}`,
);

const builder = await read("apps/draw/desktop/electron-builder.yml");
for (const requiredPath of [
  "../web/.next/standalone",
  "../web/.next/static",
  "../web/public",
]) {
  assert.ok(builder.includes(requiredPath), `desktop package must embed ${requiredPath}`);
}

console.log("UI parity invariants passed");
