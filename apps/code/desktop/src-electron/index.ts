import path from "node:path";
import { app, BrowserWindow, protocol, shell } from "electron";
import { createHandler } from "next-electron-rsc";

const development = !app.isPackaged;
if (!development) Object.assign(process.env, { NODE_ENV: "production" });
const webDirectory = development
  ? path.resolve(app.getAppPath(), "../web")
  : path.join(process.resourcesPath, "standalone/apps/code/web");

const { createInterceptor, localhostUrl } = createHandler({
  dev: development,
  dir: webDirectory,
  hostname: "evecode.localhost",
  port: 3000,
  protocol,
  turbo: true,
});

let mainWindow: BrowserWindow | undefined;
let stopInterceptor: (() => void) | undefined;

async function createWindow() {
  const window = new BrowserWindow({
    title: "Evecode",
    width: 1440,
    height: 900,
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
  await window.loadURL(localhostUrl);
}

app.whenReady().then(createWindow);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
