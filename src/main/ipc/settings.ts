import { IpcMain } from 'electron';
import { getDb } from '../database';

function getSetting(key: string, defaultValue: string = ''): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row?.value ?? defaultValue;
}

function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

export function registerSettingsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('settings:get', (_event, key: string) => getSetting(key));

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    setSetting(key, value);
    return true;
  });

  ipcMain.handle('settings:getExtractionConfig', () => {
    return {
      maxScrollsPerGroup: parseInt(getSetting('max_scrolls_per_group', '15'), 10),
      onlyLostPets: getSetting('only_lost_pets', '1') === '1',
      delayBetweenGroupsMin: parseInt(getSetting('delay_between_groups_min', '8'), 10),
      delayBetweenGroupsMax: parseInt(getSetting('delay_between_groups_max', '20'), 10),
    };
  });

  ipcMain.handle('settings:setExtractionConfig', (_event, cfg: {
    maxScrollsPerGroup: number;
    onlyLostPets: boolean;
    delayBetweenGroupsMin: number;
    delayBetweenGroupsMax: number;
  }) => {
    setSetting('max_scrolls_per_group', String(cfg.maxScrollsPerGroup));
    setSetting('only_lost_pets', cfg.onlyLostPets ? '1' : '0');
    setSetting('delay_between_groups_min', String(cfg.delayBetweenGroupsMin));
    setSetting('delay_between_groups_max', String(cfg.delayBetweenGroupsMax));
    return true;
  });
}
