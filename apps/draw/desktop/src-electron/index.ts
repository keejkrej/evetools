import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, protocol, shell } from "electron";
import { createHandler } from "next-electron-rsc";

const development = !app.isPackaged;
const environmentFile = development
  ? path.resolve(app.getAppPath(), "../../..", ".env")
  : path.join(os.homedir(), ".evetools", ".env");

if (fs.existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile);
}

process.env.EVEDRAW_DESKTOP = "1";
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
