import fs from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, dialog, protocol, shell } from "electron";
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
const { createHttpServer, createInterceptor, localhostUrl } = createHandler({
  dev: development,
  dir: webDirectory,
  hostname: "evedraw.localhost",
  port: 3000,
  protocol,
  turbo: true,
});

let mainWindow: BrowserWindow | undefined;
let stopInterceptor: (() => void) | undefined;
let pendingAuthState: string | undefined;
let pendingCallback: string | undefined;
let authServer: { close: () => Promise<void>; url: string } | undefined;

async function startExternalAuthentication() {
  await authServer?.close();
  authServer = await createHttpServer({ hostname: "127.0.0.1", port: 43117 });
  const url = new URL("/login", authServer.url);
  pendingAuthState = randomBytes(32).toString("base64url");
  url.searchParams.set("desktop", "1");
  url.searchParams.set("state", pendingAuthState);
  void shell.openExternal(url.toString());
}

function handleAuthCallback(value: string) {
  const callback = new URL(value);
  const state = callback.searchParams.get("state");
  const token = callback.searchParams.get("token");
  if (!state || !token || state !== pendingAuthState) return;
  pendingAuthState = undefined;
  void authServer?.close();
  authServer = undefined;
  if (!mainWindow) { pendingCallback = value; return; }
  void mainWindow.loadURL(`${localhostUrl}/desktop-auth/complete?token=${encodeURIComponent(token)}`);
  mainWindow.show();
  mainWindow.focus();
}

function callbackFromArgs(args: string[]) {
  return args.find((value) => value.startsWith("evedraw://callback"));
}

if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient("evedraw", process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient("evedraw");

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on("second-instance", (_event, commandLine) => {
  const callback = callbackFromArgs(commandLine);
  if (callback) handleAuthCallback(callback);
});
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (url.startsWith("evedraw://callback")) handleAuthCallback(url);
});

async function createWindow() {
  const window = new BrowserWindow({
    title: "Evedraw",
    width: 1180,
    height: 780,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  stopInterceptor = await createInterceptor({ session: window.webContents.session });
  window.webContents.on("will-navigate", (event, url) => {
    if (url === "evedraw-auth://start") {
      event.preventDefault();
      void startExternalAuthentication().catch((error) => {
        dialog.showErrorBox("Evedraw sign-in could not start", error instanceof Error ? error.message : String(error));
      });
    }
  });
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
  if (pendingCallback) {
    const callback = pendingCallback;
    pendingCallback = undefined;
    handleAuthCallback(callback);
  }
}

app.whenReady().then(createWindow);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
app.on("window-all-closed", () => {
  void authServer?.close();
  if (process.platform !== "darwin") app.quit();
});
