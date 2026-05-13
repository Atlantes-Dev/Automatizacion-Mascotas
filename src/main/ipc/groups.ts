import { IpcMain, BrowserWindow } from 'electron';
import { getDb } from '../database';

export function registerGroupHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('groups:getAll', (_event, accountId?: number) => {
    const db = getDb();
    if (accountId !== undefined && accountId !== null) {
      return db
        .prepare('SELECT * FROM groups WHERE account_id = ? ORDER BY name ASC')
        .all(accountId);
    }
    return db.prepare('SELECT * FROM groups ORDER BY account_id, name ASC').all();
  });

  ipcMain.handle('groups:toggleMonitored', (_event, id: number, monitored: boolean) => {
    getDb()
      .prepare('UPDATE groups SET monitored = ? WHERE id = ?')
      .run(monitored ? 1 : 0, id);
    BrowserWindow.getAllWindows()[0]?.webContents.send('data:changed');
    return true;
  });

  ipcMain.handle('groups:setMonitoredBatch', (_event, ids: number[], monitored: boolean) => {
    const db = getDb();
    const stmt = db.prepare('UPDATE groups SET monitored = ? WHERE id = ?');
    const tx = db.transaction((ids: number[]) => {
      for (const id of ids) stmt.run(monitored ? 1 : 0, id);
    });
    tx(ids);
    BrowserWindow.getAllWindows()[0]?.webContents.send('data:changed');
    return true;
  });

  ipcMain.handle('groups:delete', (_event, id: number) => {
    getDb().prepare('DELETE FROM groups WHERE id = ?').run(id);
    BrowserWindow.getAllWindows()[0]?.webContents.send('data:changed');
    return true;
  });

  ipcMain.handle('groups:getMonitored', () => {
    return getDb()
      .prepare('SELECT * FROM groups WHERE monitored = 1 ORDER BY account_id, name ASC')
      .all();
  });
}
