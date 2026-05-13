import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ToggleSwitch from '../components/ToggleSwitch';

interface Account {
  id: number;
  name: string;
}

interface Group {
  id: number;
  account_id: number;
  name: string;
  url: string;
  monitored: number;
  last_scanned_at: string | null;
}

const GruposScreen: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | 'all'>('all');
  const [filterText, setFilterText] = useState('');

  const refresh = useCallback(async () => {
    const accs = (await window.api.getAccounts()) as Account[];
    setAccounts(accs);
    const gs = (await window.api.getGroups()) as Group[];
    setGroups(gs);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = window.api.onDataChanged(refresh);
    return unsub;
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = groups;
    if (selectedAccountId !== 'all') list = list.filter((g) => g.account_id === selectedAccountId);
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }
    return list;
  }, [groups, selectedAccountId, filterText]);

  const monitoredCount = useMemo(() => filtered.filter((g) => g.monitored).length, [filtered]);

  const toggleAll = async (monitored: boolean) => {
    const ids = filtered.map((g) => g.id);
    if (ids.length === 0) return;
    await window.api.setMonitoredBatch(ids, monitored);
    await refresh();
  };

  const toggleOne = async (id: number, val: boolean) => {
    await window.api.toggleGroupMonitored(id, val);
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, monitored: val ? 1 : 0 } : g)));
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-100">Grupos de Facebook</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Activa los grupos que quieres monitorear. {monitoredCount} de {filtered.length} activo(s).
        </p>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
          className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-500"
        >
          <option value="all">Todas las cuentas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Buscar grupo..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="flex-1 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-500"
        />

        <button
          onClick={() => toggleAll(true)}
          className="px-3 py-2 text-xs text-neutral-300 hover:text-neutral-100 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
        >
          Activar todos
        </button>
        <button
          onClick={() => toggleAll(false)}
          className="px-3 py-2 text-xs text-neutral-300 hover:text-neutral-100 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
        >
          Desactivar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 text-sm">
            No hay grupos. Agrega una cuenta primero para detectar grupos.
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((g) => {
              const acc = accounts.find((a) => a.id === g.account_id);
              return (
                <div
                  key={g.id}
                  className="flex items-center gap-3 px-3 py-2 bg-neutral-800/40 hover:bg-neutral-800/70 rounded-lg border border-neutral-700/30 transition-colors"
                >
                  <ToggleSwitch
                    checked={!!g.monitored}
                    onChange={(v) => toggleOne(g.id, v)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-neutral-100 truncate">{g.name}</div>
                    <div className="text-[10px] text-neutral-500 flex items-center gap-2 mt-0.5">
                      <span>{acc?.name || '—'}</span>
                      {g.last_scanned_at && (
                        <>
                          <span>•</span>
                          <span>Último escaneo: {g.last_scanned_at}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <a
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir grupo en Facebook"
                    className="text-neutral-500 hover:text-accent-400 p-1.5 rounded transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default GruposScreen;
