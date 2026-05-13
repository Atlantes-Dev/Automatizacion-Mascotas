import React, { useCallback, useEffect, useState } from 'react';
import ToggleSwitch from '../components/ToggleSwitch';

interface LogEntry {
  message: string;
  type: string;
  time: string;
}

interface Progress {
  done: number;
  total: number;
  found: number;
}

interface ExtractionConfig {
  maxScrollsPerGroup: number;
  onlyLostPets: boolean;
  delayBetweenGroupsMin: number;
  delayBetweenGroupsMax: number;
}

const ExtraccionScreen: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [monitoredCount, setMonitoredCount] = useState(0);
  const [config, setConfig] = useState<ExtractionConfig>({
    maxScrollsPerGroup: 15,
    onlyLostPets: true,
    delayBetweenGroupsMin: 8,
    delayBetweenGroupsMax: 20,
  });

  const refresh = useCallback(async () => {
    const monitored = (await window.api.getMonitoredGroups()) as any[];
    setMonitoredCount(monitored.length);
    const state = (await window.api.getExtractionState()) as { running: boolean };
    setRunning(state.running);
    const cfg = (await window.api.getExtractionConfig()) as ExtractionConfig;
    setConfig(cfg);
  }, []);

  useEffect(() => {
    refresh();
    const unsubStatus = window.api.onExtractionStatus((data) => {
      const time = new Date().toLocaleTimeString();
      setLogs((prev) => [...prev.slice(-200), { ...data, time }]);
    });
    const unsubProgress = window.api.onExtractionProgress((data) => setProgress(data));
    const unsubFinished = window.api.onExtractionFinished(() => {
      setRunning(false);
    });
    return () => { unsubStatus(); unsubProgress(); unsubFinished(); };
  }, [refresh]);

  const start = async () => {
    setLogs([]);
    setProgress(null);
    const result = await window.api.startExtraction();
    if (result.success) setRunning(true);
    else alert(result.error || 'No se pudo iniciar.');
  };

  const stop = async () => {
    await window.api.stopExtraction();
  };

  const saveConfig = async (next: ExtractionConfig) => {
    setConfig(next);
    await window.api.setExtractionConfig(next);
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-100">Extracción</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Recorre los grupos monitoreados y guarda los posts de mascotas extraviadas.
          </p>
        </div>
        {running ? (
          <button
            onClick={stop}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <span className="w-2 h-2 bg-white rounded-sm" />
            Detener
          </button>
        ) : (
          <button
            onClick={start}
            disabled={monitoredCount === 0}
            className="px-4 py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Iniciar extracción
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-neutral-800/60 rounded-lg border border-neutral-700/40">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Grupos monitoreados</div>
          <div className="text-xl font-semibold text-neutral-100 mt-1">{monitoredCount}</div>
        </div>
        <div className="p-3 bg-neutral-800/60 rounded-lg border border-neutral-700/40">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Estado</div>
          <div className="text-xl font-semibold mt-1">
            {running ? (
              <span className="text-accent-400">En ejecución</span>
            ) : (
              <span className="text-neutral-400">Detenido</span>
            )}
          </div>
        </div>
      </div>

      {progress && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5">
            <span>{progress.done} / {progress.total} grupos · {progress.found} mascotas nuevas</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-accent-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <details className="mb-4 bg-neutral-800/40 rounded-lg border border-neutral-700/40 group">
        <summary className="px-4 py-2.5 cursor-pointer text-sm text-neutral-200 select-none flex items-center justify-between">
          <span>Configuración avanzada</span>
          <svg className="w-3 h-3 text-neutral-500 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </summary>
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-neutral-700/40">
          <div className="flex items-center justify-between">
            <label className="text-xs text-neutral-300">Filtrar solo mascotas perdidas</label>
            <ToggleSwitch
              checked={config.onlyLostPets}
              onChange={(v) => saveConfig({ ...config, onlyLostPets: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-neutral-300">Scrolls máximos por grupo</label>
            <input
              type="number"
              min={3}
              max={50}
              value={config.maxScrollsPerGroup}
              onChange={(e) => saveConfig({ ...config, maxScrollsPerGroup: parseInt(e.target.value || '15', 10) })}
              className="w-20 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-accent-500"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-neutral-300">Pausa entre grupos (seg)</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={120}
                value={config.delayBetweenGroupsMin}
                onChange={(e) => saveConfig({ ...config, delayBetweenGroupsMin: parseInt(e.target.value || '8', 10) })}
                className="w-16 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-accent-500"
              />
              <span className="text-xs text-neutral-500">a</span>
              <input
                type="number"
                min={1}
                max={120}
                value={config.delayBetweenGroupsMax}
                onChange={(e) => saveConfig({ ...config, delayBetweenGroupsMax: parseInt(e.target.value || '20', 10) })}
                className="w-16 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-accent-500"
              />
            </div>
          </div>
        </div>
      </details>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="text-[11px] text-neutral-500 uppercase tracking-wide mb-2">Registro</div>
        <div className="flex-1 bg-neutral-950/60 border border-neutral-700/40 rounded-lg overflow-y-auto p-2 font-mono text-[11px]">
          {logs.length === 0 ? (
            <div className="text-neutral-600 italic">Sin actividad.</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-2 py-0.5">
                <span className="text-neutral-600 flex-shrink-0">{log.time}</span>
                <span className={
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-emerald-400' :
                  log.type === 'warn' ? 'text-yellow-400' :
                  'text-neutral-300'
                }>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ExtraccionScreen;
