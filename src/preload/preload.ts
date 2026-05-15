import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // App
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Cuentas
  getAccounts: () => ipcRenderer.invoke('accounts:getAll'),
  toggleAccount: (id: number, active: boolean) => ipcRenderer.invoke('accounts:toggle', id, active),
  deleteAccount: (id: number) => ipcRenderer.invoke('accounts:delete', id),
  checkSessions: (accountIds: number[]) => ipcRenderer.invoke('accounts:checkSessions', accountIds),

  // Grupos
  getGroups: (accountId?: number) => ipcRenderer.invoke('groups:getAll', accountId),
  toggleGroupMonitored: (id: number, monitored: boolean) => ipcRenderer.invoke('groups:toggleMonitored', id, monitored),
  setMonitoredBatch: (ids: number[], monitored: boolean) => ipcRenderer.invoke('groups:setMonitoredBatch', ids, monitored),
  deleteGroup: (id: number) => ipcRenderer.invoke('groups:delete', id),
  getMonitoredGroups: () => ipcRenderer.invoke('groups:getMonitored'),

  // Mascotas
  getPets: (filter?: { status?: string; groupId?: number }) => ipcRenderer.invoke('pets:getAll', filter),
  updatePetStatus: (id: number, status: string) => ipcRenderer.invoke('pets:updateStatus', id, status),
  updatePetNotes: (id: number, notes: string) => ipcRenderer.invoke('pets:updateNotes', id, notes),
  deletePet: (id: number) => ipcRenderer.invoke('pets:delete', id),
  getPetCounts: () => ipcRenderer.invoke('pets:counts'),

  // Extracción
  startExtraction: () => ipcRenderer.invoke('extraction:start'),
  stopExtraction: () => ipcRenderer.invoke('extraction:stop'),
  getExtractionState: () => ipcRenderer.invoke('extraction:getState'),
  getExtractionRuns: () => ipcRenderer.invoke('extraction:getRuns'),
  getExtractionRunsWithStats: () => ipcRenderer.invoke('extraction:getRunsWithStats'),
  getExtractionRunPosts: (runId: number) => ipcRenderer.invoke('extraction:getRunPosts', runId),

  // Playwright
  checkChromium: () => ipcRenderer.invoke('playwright:checkChromium'),
  openLoginWindow: () => ipcRenderer.invoke('playwright:openLogin'),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  getExtractionConfig: () => ipcRenderer.invoke('settings:getExtractionConfig'),
  setExtractionConfig: (cfg: {
    maxScrollsPerGroup: number;
    onlyLostPets: boolean;
    delayBetweenGroupsMin: number;
    delayBetweenGroupsMax: number;
    incrementalMode: boolean;
    incrementalStopAfter: number;
  }) => ipcRenderer.invoke('settings:setExtractionConfig', cfg),

  // Eventos
  onExtractionStatus: (cb: (data: { message: string; type: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on('extraction:status', handler);
    return () => { ipcRenderer.removeListener('extraction:status', handler); };
  },
  onExtractionProgress: (cb: (data: { done: number; total: number; found: number }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on('extraction:progress', handler);
    return () => { ipcRenderer.removeListener('extraction:progress', handler); };
  },
  onExtractionFinished: (cb: (data: { found: number }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on('extraction:finished', handler);
    return () => { ipcRenderer.removeListener('extraction:finished', handler); };
  },
  onDataChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('data:changed', handler);
    return () => { ipcRenderer.removeListener('data:changed', handler); };
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
