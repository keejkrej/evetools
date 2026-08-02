import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, protocol, shell } from "electron";
import { createHandler } from "next-electron-rsc";

function loadDesktopEnvironment() {
  const envFile = path.join(os.homedir(), ".evedraw", ".env");
  if (!fs.existsSync(envFile)) return;

  for (const sourceLine of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = sourceLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDesktopEnvironment();
process.env.EVEDRAW_DESKTOP = "1";

const development = !app.isPackaged;
if (!development) Object.assign(process.env, { NODE_ENV: "production" });
const webDirectory = development
  ? path.resolve(app.getAppPath(), "../web")
  : path.join(process.resourcesPath, "standalone/apps/draw/web");
const { createInterceptor, localhostUrl } = createHandler({
  dev: development,
  dir: webDirectory,
  hostname: "evedraw.localhost",
  port: 3000,
  protocol,
  turbo: true,
});

let mainWindow: BrowserWindow | undefined;
let stopInterceptor: (() => void) | undefined;

async function createWindow() {
  const window = new BrowserWindow({
    title: "Evedraw",
    width: 1180,
    height: 780,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  stopInterceptor = await createInterceptor({ session: window.webContents.session });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  window.on("closed", () => {
    stopInterceptor?.();
    stopInterceptor = undefined;
    mainWindow = undefined;
  });

  mainWindow = window;
  await window.loadURL(`${localhostUrl}/login`);
}

app.whenReady().then(createWindow);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
