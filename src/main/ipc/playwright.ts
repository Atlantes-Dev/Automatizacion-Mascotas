import { IpcMain, BrowserWindow } from 'electron';
import { getChromiumExecutable } from './playwright/chromium';
import { runLoginFlow, rescanGroupsForAccount } from './playwright/loginFlow';

export { getChromiumExecutable };

export function registerPlaywrightHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('playwright:checkChromium', () => {
    const execPath = getChromiumExecutable();
    return { installed: !!execPath, path: execPath };
  });

  ipcMain.handle('playwright:openLogin', async () => {
    const result = await runLoginFlow();
    if (result.success) {
      BrowserWindow.getAllWindows()[0]?.webContents.send('data:changed');
    }
    return result;
  });

  ipcMain.handle('accounts:rescanGroups', async (_event, accountId: number) => {
    const result = await rescanGroupsForAccount(accountId);
    if (result.success) {
      BrowserWindow.getAllWindows()[0]?.webContents.send('data:changed');
    }
    return result;
  });
}
