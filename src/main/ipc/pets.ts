import { IpcMain, BrowserWindow } from 'electron';
import { getDb } from '../database';

export function registerPetHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('pets:getAll', (_event, filter?: { status?: string; groupId?: number }) => {
    const db = getDb();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.status) {
      conditions.push('p.status = ?');
      params.push(filter.status);
    }
    if (filter?.groupId !== undefined) {
      conditions.push('p.group_id = ?');
      params.push(filter.groupId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT p.*, g.name AS group_name, g.url AS group_url
      FROM pets p
      JOIN groups g ON g.id = p.group_id
      ${where}
      ORDER BY p.collected_at DESC
    `;
    return db.prepare(sql).all(...params);
  });

  ipcMain.handle('pets:updateStatus', (_event, id: number, status: string) => {
    getDb().prepare('UPDATE pets SET status = ? WHERE id = ?').run(status, id);
    BrowserWindow.getAllWindows()[0]?.webContents.send('data:changed');
    return true;
  });

  ipcMain.handle('pets:updateNotes', (_event, id: number, notes: string) => {
    getDb().prepare('UPDATE pets SET notes = ? WHERE id = ?').run(notes, id);
    return true;
  });

  ipcMain.handle('pets:delete', (_event, id: number) => {
    getDb().prepare('DELETE FROM pets WHERE id = ?').run(id);
    BrowserWindow.getAllWindows()[0]?.webContents.send('data:changed');
    return true;
  });

  ipcMain.handle('pets:counts', () => {
    const db = getDb();
    const rows = db
      .prepare("SELECT status, COUNT(*) AS n FROM pets GROUP BY status")
      .all() as Array<{ status: string; n: number }>;
    const result: Record<string, number> = { nuevo: 0, revisado: 0, descartado: 0, contactado: 0, total: 0 };
    for (const r of rows) {
      result[r.status] = r.n;
      result.total += r.n;
    }
    return result;
  });
}
