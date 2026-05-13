import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { initDatabase } from './database';
import { registerAccountHandlers } from './ipc/accounts';
import { registerGroupHandlers } from './ipc/groups';
import { registerPetHandlers } from './ipc/pets';
import { registerExtractionHandlers } from './ipc/extraction';
import { registerPlaywrightHandlers } from './ipc/playwright';
import { registerSettingsHandlers } from './ipc/settings';
import { startSessionKeepAlive } from './ipc/playwright/sessionKeepAlive';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 1000,
    minHeight: 680,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    title: 'Mascotas Extraviadas',
    icon: path.join(__dirname, '../../assets/icon.ico'),
    backgroundColor: '#1a1a18',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (
        (input.key === 'F12') ||
        (input.control && input.shift && input.key === 'I') ||
        (input.control && input.shift && input.key === 'J') ||
        (input.control && input.shift && input.key === 'C')
      ) {
        _event.preventDefault();
      }
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  initDatabase();

  registerAccountHandlers(ipcMain);
  registerGroupHandlers(ipcMain);
  registerPetHandlers(ipcMain);
  registerExtractionHandlers(ipcMain);
  registerPlaywrightHandlers(ipcMain);
  registerSettingsHandlers(ipcMain);
  ipcMain.handle('app:getVersion', () => app.getVersion());

  createWindow();
  startSessionKeepAlive();
});

app.on('window-all-closed', () => { app.quit(); });

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
