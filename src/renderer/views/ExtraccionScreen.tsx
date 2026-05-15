import React, { useCallback, useEffect, useState, useRef } from 'react';
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
  incrementalMode: boolean;
  incrementalStopAfter: number;
}

interface RunWithStats {
  id: number;
  started_at: string;
  finished_at: string | null;
  groups_total: number;
  groups_done: number;
  posts_found: number;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  posts_seen: number;
  posts_new: number;
}

interface RunPost {
  id: number;
  post_url: string;
  author_name: string;
  author_url: string;
  text: string;
  images: string; // JSON string
  status: string;
  collected_at: string;
  group_name: string | null;
  is_new: number;
  seen_at: string;
}

// ─── HELPERS DE FORMATO ────────────────────────────────────────────────────────
function parseLocalDate(s: string | null): Date | null {
  if (!s) return null;
  // SQLite datetime('now', 'localtime') devuelve "YYYY-MM-DD HH:MM:SS" en hora local.
  // Lo parseamos como local-time, no UTC.
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return new Date(s);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function formatRelative(iso: string): string {
  const d = parseLocalDate(iso);
  if (!d) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  const time = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Hoy, ${time}`;
  if (isYesterday) return `Ayer, ${time}`;
  return `${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}, ${time}`;
}

function formatDuration(startIso: string, endIso: string | null): string {
  const start = parseLocalDate(startIso);
  const end = endIso ? parseLocalDate(endIso) : new Date();
  if (!start || !end) return '—';
  const sec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

const STATUS_LABEL: Record<RunWithStats['status'], string> = {
  running: 'En curso',
  completed: 'Completada',
  failed: 'Falló',
  stopped: 'Detenida',
};

// ─── NUMERIC INPUT ────────────────────────────────────────────────────────────
// Los <input type="number"> con min/max devuelven e.target.value="" cuando el
// valor en pantalla viola el límite (p.ej. borrar "15" deja "1" < min=3), lo que
// provoca que el campo se congele porque el || 'fallback' del onChange lo resetea.
// Solución: type="text" + inputMode="numeric" con estado de borrador local.
// Solo se persiste en el padre cuando el valor es válido; onBlur normaliza al mínimo.
const NumericInput: React.FC<{
  value: number;
  min?: number;
  onChange: (val: number) => void;
  className?: string;
}> = ({ value, min = 1, onChange, className }) => {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft !== null ? draft : String(value)}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^0-9]/g, '');
        setDraft(cleaned);
        const parsed = parseInt(cleaned, 10);
        if (!isNaN(parsed) && parsed >= min) onChange(parsed);
      }}
      onBlur={(e) => {
        const parsed = parseInt(e.target.value, 10);
        const final = isNaN(parsed) || parsed < min ? min : parsed;
        onChange(final);
        setDraft(null);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={className}
    />
  );
};

// ─── COMPONENTE ───────────────────────────────────────────────────────────────
const ExtraccionScreen: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [monitoredCount, setMonitoredCount] = useState(0);
  const [config, setConfig] = useState<ExtractionConfig>({
    maxScrollsPerGroup: 15,
    onlyLostPets: true,
    delayBetweenGroupsMin: 8,
    delayBetweenGroupsMax: 20,
    incrementalMode: true,
    incrementalStopAfter: 3,
  });

  const [runs, setRuns] = useState<RunWithStats[]>([]);
  const [liveProgress, setLiveProgress] = useState<Progress | null>(null);
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [runPostsCache, setRunPostsCache] = useState<Record<number, RunPost[]>>({});
  const liveLogRef = useRef<HTMLDivElement>(null);

  // ─── FETCH INICIAL Y REFETCH ────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const monitored = (await window.api.getMonitoredGroups()) as any[];
    setMonitoredCount(monitored.length);
    const state = (await window.api.getExtractionState()) as { running: boolean };
    setRunning(state.running);
    const cfg = (await window.api.getExtractionConfig()) as ExtractionConfig;
    setConfig(cfg);
    const list = (await window.api.getExtractionRunsWithStats()) as RunWithStats[];
    setRuns(list);
  }, []);

  useEffect(() => {
    refresh();
    const unsubStatus = window.api.onExtractionStatus((data) => {
      const time = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLiveLogs((prev) => [...prev.slice(-100), { ...data, time }]);
    });
    const unsubProgress = window.api.onExtractionProgress((data) => setLiveProgress(data));
    const unsubFinished = window.api.onExtractionFinished(() => {
      setRunning(false);
      setLiveProgress(null);
      // Refrescar lista para que aparezca el run completado con sus contadores finales.
      refresh();
      // Invalidar caché de posts del run para que el expand recargue datos frescos.
      setRunPostsCache({});
    });
    return () => { unsubStatus(); unsubProgress(); unsubFinished(); };
  }, [refresh]);

  // Auto-scroll de los logs en vivo al fondo.
  useEffect(() => {
    if (liveLogRef.current) {
      liveLogRef.current.scrollTop = liveLogRef.current.scrollHeight;
    }
  }, [liveLogs]);

  const start = async () => {
    setLiveLogs([]);
    setLiveProgress(null);
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

  // ─── EXPAND DE UN RUN: cargar posts perezosamente ───────────────────────────
  const toggleExpand = useCallback(async (runId: number) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    if (!runPostsCache[runId]) {
      const posts = (await window.api.getExtractionRunPosts(runId)) as RunPost[];
      setRunPostsCache((prev) => ({ ...prev, [runId]: posts }));
    }
  }, [expandedRunId, runPostsCache]);

  // El primer run en estado 'running' es el live. Si lo hay, lo separamos visualmente.
  const runningRun = runs.find((r) => r.status === 'running') || null;
  const finishedRuns = runs.filter((r) => r.status !== 'running');
  const pct = liveProgress && liveProgress.total > 0
    ? Math.round((liveProgress.done / liveProgress.total) * 100)
    : 0;

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      {/* ─── TOOLBAR COMPACTA ─── */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-neutral-100">Extracción</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
            {monitoredCount} grupo{monitoredCount === 1 ? '' : 's'} monitoreado{monitoredCount === 1 ? '' : 's'}
            {' · '}Recopila posts de mascotas extraviadas.
          </p>
        </div>
        {running ? (
          <button
            onClick={stop}
            className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 flex-shrink-0"
          >
            <span className="w-2 h-2 bg-white rounded-sm" />
            Detener
          </button>
        ) : (
          <button
            onClick={start}
            disabled={monitoredCount === 0}
            className="px-3.5 py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Iniciar extracción
          </button>
        )}
      </div>

      {/* ─── CONFIG COLAPSADA ─── */}
      <details className="mb-3 bg-neutral-800/40 rounded-lg border border-neutral-700/40 group">
        <summary className="px-3.5 py-2 cursor-pointer text-xs text-neutral-300 select-none flex items-center justify-between hover:bg-neutral-800/60 transition-colors rounded-lg">
          <span>Configuración avanzada</span>
          <svg className="w-3 h-3 text-neutral-500 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </summary>
        <div className="px-3.5 pb-3 pt-1 space-y-2.5 border-t border-neutral-700/40">
          <div className="flex items-center justify-between">
            <label className="text-xs text-neutral-300">Filtrar solo mascotas perdidas</label>
            <ToggleSwitch
              checked={config.onlyLostPets}
              onChange={(v) => saveConfig({ ...config, onlyLostPets: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <label className="text-xs text-neutral-300 block">Modo incremental</label>
              <p className="text-[10px] text-neutral-500 leading-tight mt-0.5">
                Corta el scroll cuando llega a posts ya conocidos.
              </p>
            </div>
            <ToggleSwitch
              checked={config.incrementalMode}
              onChange={(v) => saveConfig({ ...config, incrementalMode: v })}
            />
          </div>
          {config.incrementalMode && (
            <div className="flex items-center justify-between pl-3 border-l-2 border-accent-500/30">
              <label className="text-xs text-neutral-400">Rondas sin nuevos antes de cortar</label>
              <NumericInput
                value={config.incrementalStopAfter}
                min={1}
                onChange={(val) => saveConfig({ ...config, incrementalStopAfter: val })}
                className="w-16 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-accent-500"
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="text-xs text-neutral-300">Scrolls máximos por grupo</label>
            <NumericInput
              value={config.maxScrollsPerGroup}
              min={1}
              onChange={(val) => saveConfig({ ...config, maxScrollsPerGroup: val })}
              className="w-20 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-accent-500"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-neutral-300">Pausa entre grupos (seg)</label>
            <div className="flex items-center gap-1.5">
              <NumericInput
                value={config.delayBetweenGroupsMin}
                min={1}
                onChange={(val) => saveConfig({ ...config, delayBetweenGroupsMin: val })}
                className="w-16 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-accent-500"
              />
              <span className="text-xs text-neutral-500">a</span>
              <NumericInput
                value={config.delayBetweenGroupsMax}
                min={1}
                onChange={(val) => saveConfig({ ...config, delayBetweenGroupsMax: val })}
                className="w-16 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-accent-500"
              />
            </div>
          </div>
        </div>
      </details>

      {/* ─── HEADER LISTA ─── */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] text-neutral-500 uppercase tracking-wide">Recopilaciones</h3>
        <span className="text-[10px] text-neutral-600">{runs.length} registro{runs.length === 1 ? '' : 's'}</span>
      </div>

      {/* ─── LISTA DE RUNS ─── */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {/* Live card si hay un run en ejecución */}
        {runningRun && (
          <LiveRunCard
            run={runningRun}
            progress={liveProgress}
            pct={pct}
            logs={liveLogs}
            logRef={liveLogRef}
          />
        )}

        {finishedRuns.length === 0 && !runningRun ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-neutral-800/60 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </div>
            <p className="text-sm text-neutral-400">Aún no hay recopilaciones.</p>
            <p className="text-xs text-neutral-600 mt-1">Inicia una extracción para empezar.</p>
          </div>
        ) : (
          finishedRuns.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              expanded={expandedRunId === run.id}
              posts={runPostsCache[run.id]}
              onToggle={() => toggleExpand(run.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ─── CARD DEL RUN EN VIVO ─────────────────────────────────────────────────────
const LiveRunCard: React.FC<{
  run: RunWithStats;
  progress: Progress | null;
  pct: number;
  logs: LogEntry[];
  logRef: React.RefObject<HTMLDivElement>;
}> = ({ run, progress, pct, logs, logRef }) => (
  <div className="rounded-lg border border-accent-500/40 bg-accent-500/5 ring-1 ring-accent-500/20 overflow-hidden">
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-400" />
          </span>
          <span className="text-sm font-medium text-accent-200">En curso</span>
          <span className="text-xs text-neutral-500">· {formatRelative(run.started_at)}</span>
        </div>
        <span className="text-xs text-neutral-400 tabular-nums">{formatDuration(run.started_at, null)}</span>
      </div>

      {progress && (
        <>
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
            <span>{progress.done}/{progress.total} grupos · {progress.found} nuevas</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 bg-neutral-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}
    </div>

    {logs.length > 0 && (
      <div
        ref={logRef}
        className="max-h-32 overflow-y-auto bg-neutral-950/40 border-t border-accent-500/20 px-3 py-2 font-mono text-[10.5px] space-y-0.5"
      >
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2">
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
        ))}
      </div>
    )}
  </div>
);

// ─── CARD DE UN RUN FINALIZADO ────────────────────────────────────────────────
const RunCard: React.FC<{
  run: RunWithStats;
  expanded: boolean;
  posts: RunPost[] | undefined;
  onToggle: () => void;
}> = ({ run, expanded, posts, onToggle }) => {
  const statusColor = run.status === 'completed' ? 'text-emerald-400'
    : run.status === 'failed' ? 'text-red-400'
    : run.status === 'stopped' ? 'text-yellow-400'
    : 'text-neutral-400';

  return (
    <div className={`rounded-lg border bg-neutral-800/40 transition-colors ${expanded ? 'border-neutral-600' : 'border-neutral-700/40 hover:border-neutral-700'}`}>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <svg
              className={`w-3 h-3 text-neutral-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-sm font-medium text-neutral-100">{formatRelative(run.started_at)}</span>
            <span className={`text-[10px] uppercase tracking-wide ${statusColor}`}>
              · {STATUS_LABEL[run.status]}
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 ml-5">
            {run.groups_done}/{run.groups_total} grupos · {formatDuration(run.started_at, run.finished_at)}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Stat label="vistos" value={run.posts_seen} />
          <Stat label="nuevos" value={run.posts_new} highlight />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-700/40 px-4 py-3">
          {!posts ? (
            <div className="text-xs text-neutral-500 italic">Cargando posts…</div>
          ) : posts.length === 0 ? (
            <div className="text-xs text-neutral-500 italic">No se capturaron posts en este run.</div>
          ) : (
            <RunPostsList posts={posts} />
          )}
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className="text-right">
    <div className={`text-base font-semibold tabular-nums ${highlight ? 'text-accent-300' : 'text-neutral-200'}`}>
      {value}
    </div>
    <div className="text-[9px] text-neutral-500 uppercase tracking-wider leading-none">{label}</div>
  </div>
);

// ─── LISTA DE POSTS DENTRO DE UN RUN EXPANDIDO ────────────────────────────────
const RunPostsList: React.FC<{ posts: RunPost[] }> = ({ posts }) => {
  const nuevos = posts.filter((p) => p.is_new === 1);
  const conocidos = posts.filter((p) => p.is_new === 0);

  return (
    <div className="space-y-3">
      {nuevos.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-accent-400 mb-1.5 flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 1l2.5 6.5L19 10l-6.5 2.5L10 19l-2.5-6.5L1 10l6.5-2.5L10 1z" />
            </svg>
            Nuevos en esta recopilación ({nuevos.length})
          </div>
          <div className="space-y-1.5">
            {nuevos.map((p) => <PostRow key={p.id} post={p} accent />)}
          </div>
        </div>
      )}
      {conocidos.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
            Ya conocidos ({conocidos.length})
          </div>
          <div className="space-y-1.5">
            {conocidos.map((p) => <PostRow key={p.id} post={p} />)}
          </div>
        </div>
      )}
    </div>
  );
};

const PostRow: React.FC<{ post: RunPost; accent?: boolean }> = ({ post, accent }) => {
  let images: string[] = [];
  try { images = JSON.parse(post.images || '[]'); } catch { /* ignore */ }
  const thumb = images[0];

  return (
    <div className={`flex gap-2.5 p-2 rounded-md ${accent ? 'bg-accent-500/5 border border-accent-500/15' : 'bg-neutral-900/40 border border-neutral-800/60'}`}>
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="w-12 h-12 rounded object-cover flex-shrink-0 bg-neutral-800"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-12 h-12 rounded bg-neutral-800/60 flex-shrink-0 flex items-center justify-center">
          <svg className="w-5 h-5 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-medium text-neutral-200 truncate">{post.author_name || 'Sin autor'}</span>
          {post.group_name && (
            <span className="text-neutral-600 truncate">· {post.group_name}</span>
          )}
        </div>
        {/* Texto completo — sin slice ni line-clamp. whitespace-pre-wrap respeta saltos de línea del post. */}
        <p className="text-[11.5px] text-neutral-300 mt-0.5 leading-snug whitespace-pre-wrap break-words">
          {post.text || <span className="italic text-neutral-600">(sin texto)</span>}
        </p>
      </div>
      <a
        href={post.post_url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="self-start text-neutral-600 hover:text-accent-400 transition-colors flex-shrink-0 p-1"
        title="Abrir en Facebook"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    </div>
  );
};

export default ExtraccionScreen;
