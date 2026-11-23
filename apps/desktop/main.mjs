/**
 * Electron main process — wraps the Vite web build of Splot MIDI Brain.
 * Keeps Web MIDI + Web Audio in Chromium (same stack as Chrome).
 */
import { app, BrowserWindow, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronUpdater from 'electron-updater';
import { isDesktopPermissionAllowed } from './lib/permissions.mjs';
import { resolveUpdateFeed } from './lib/update-feed.mjs';
import { resolveWebIndex, resolveWebRoot } from './lib/web-root.mjs';

const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {BrowserWindow | null} */
let mainWindow = null;

function installPermissionHandlers() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(isDesktopPermissionAllowed(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return isDesktopPermissionAllowed(permission);
  });
}

function createWindow() {
  const webRoot = resolveWebRoot({
    isPackaged: app.isPackaged,
    desktopDir: __dirname,
    resourcesPath: process.resourcesPath,
  });
  const indexHtml = resolveWebIndex(webRoot);

  if (!fs.existsSync(indexHtml)) {
    throw new Error(
      `Desktop shell cannot find the web build at ${indexHtml}. Run: npm run build:desktop`,
    );
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#101112',
    title: 'Splot MIDI Brain',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Same-origin file load of the Vite SPA; MIDI/audio stay in Chromium.
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  void mainWindow.loadFile(indexHtml);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  if (process.env.SPLOT_DISABLE_AUTO_UPDATE === '1') return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL(resolveUpdateFeed());

  autoUpdater.on('error', (err) => {
    console.error('[splot-updater]', err?.message ?? err);
  });

  // Quiet check shortly after launch; OS notification when an update is ready.
  setTimeout(() => {
    void autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[splot-updater]', err?.message ?? err);
    });
  }, 4_000);
}

app.whenReady().then(() => {
  installPermissionHandlers();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
