import { IpcMain, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getDb } from '../database';

export function registerAccountHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('accounts:getAll', () => {
    const db = getDb();
    return db.prepare('SELECT id, name, avatar, created_at, active FROM accounts ORDER BY created_at DESC').all();
  });

  ipcMain.handle('accounts:toggle', (_event, id: number, active: boolean) => {
    getDb().prepare('UPDATE accounts SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
    BrowserWindow.getAllWindows()[0]?.webContents.send('data:changed');
    return true;
  });

  ipcMain.handle('accounts:delete', (_event, id: number) => {
    getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id);
    const profileDir = path.join(app.getPath('userData'), 'profiles', `account_${id}`);
    if (fs.existsSync(profileDir)) {
      try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignorar */ }
    }
    BrowserWindow.getAllWindows()[0]?.webContents.send('data:changed');
    return true;
  });

  ipcMain.handle('accounts:checkSessions', (_event, accountIds: number[]) => {
    const db = getDb();
    const nowSecs = Math.floor(Date.now() / 1000);

    return accountIds.map((id) => {
      const account = db.prepare('SELECT id, name, cookies FROM accounts WHERE id = ?').get(id) as any;
      if (!account) return { accountId: id, name: 'Desconocida', valid: false };

      let valid = false;
      try {
        const cookies: Array<{ name: string; expires?: number }> = JSON.parse(account.cookies || '[]');
        const cUser = cookies.find((c) => c.name === 'c_user');
        const xs = cookies.find((c) => c.name === 'xs');

        if (cUser && xs) {
          const cUserOk = !cUser.expires || cUser.expires === -1 || cUser.expires > nowSecs;
          const xsOk = !xs.expires || xs.expires === -1 || xs.expires > nowSecs;
          valid = cUserOk && xsOk;
        }
      } catch { valid = false; }

      return { accountId: id, name: account.name || 'Cuenta', valid };
    });
  });
}
