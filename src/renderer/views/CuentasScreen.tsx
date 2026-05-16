import React, { useCallback, useEffect, useState } from 'react';

interface Account {
  id: number;
  name: string;
  avatar: string;
  created_at: string;
  active: number;
}

interface SessionState {
  accountId: number;
  name: string;
  valid: boolean;
}

const CuentasScreen: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sessions, setSessions] = useState<Record<number, boolean>>({});
  const [loggingIn, setLoggingIn] = useState(false);
  const [rescanningIds, setRescanningIds] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);

  const refresh = useCallback(async () => {
    const list = (await window.api.getAccounts()) as Account[];
    setAccounts(list);
    if (list.length > 0) {
      const sessionStates = (await window.api.checkSessions(list.map((a) => a.id))) as SessionState[];
      const map: Record<number, boolean> = {};
      for (const s of sessionStates) map[s.accountId] = s.valid;
      setSessions(map);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = window.api.onDataChanged(refresh);
    return unsubscribe;
  }, [refresh]);

  const addAccount = async () => {
    setLoggingIn(true);
    setMessage({ text: 'Abriendo navegador. Inicia sesión en Facebook...', type: 'info' });
    try {
      const result = await window.api.openLoginWindow();
      if (result.success) {
        setMessage({
          text: `Cuenta "${result.name}" agregada. ${result.groupsCount} grupo(s) detectados.`,
          type: 'success',
        });
        await refresh();
      } else {
        setMessage({ text: result.error || 'No se pudo agregar la cuenta.', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoggingIn(false);
    }
  };

  const removeAccount = async (id: number, name: string) => {
    if (!confirm(`¿Eliminar la cuenta "${name}"? Se borrarán sus grupos y mascotas asociadas.`)) return;
    await window.api.deleteAccount(id);
    await refresh();
  };

  const rescanGroups = async (id: number, name: string) => {
    setRescanningIds((prev) => new Set(prev).add(id));
    setMessage({ text: `Buscando grupos nuevos de "${name}"...`, type: 'info' });
    try {
      const result = await window.api.rescanGroups(id) as any;
      if (result.success) {
        setMessage({
          text: result.newGroupsCount > 0
            ? `Se encontraron ${result.newGroupsCount} grupo(s) nuevo(s) de ${result.totalGroupsCount} en total.`
            : `Sin grupos nuevos. (${result.totalGroupsCount} grupos detectados en total)`,
          type: result.newGroupsCount > 0 ? 'success' : 'info',
        });
        await refresh();
      } else {
        setMessage({ text: result.error || 'No se pudo actualizar los grupos.', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setRescanningIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-100">Cuentas de Facebook</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Inicia sesión con la cuenta que está en los grupos de mascotas.
          </p>
        </div>
        <button
          onClick={addAccount}
          disabled={loggingIn}
          className="px-4 py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {loggingIn ? 'Iniciando sesión...' : 'Agregar cuenta'}
        </button>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-xs mb-3 ${
          message.type === 'error' ? 'bg-red-900/30 text-red-300 border border-red-700/40' :
          message.type === 'success' ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-700/40' :
          'bg-accent-900/30 text-accent-300 border border-accent-700/40'
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {accounts.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 text-sm">
            No hay cuentas. Agrega una para empezar.
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center gap-3 p-3 bg-neutral-800/60 rounded-lg border border-neutral-700/40"
              >
                {acc.avatar ? (
                  <img src={acc.avatar} alt={acc.name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center text-neutral-400 text-sm">
                    {acc.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-neutral-100 truncate">{acc.name}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    Agregada {acc.created_at}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-1 rounded-md border ${
                    sessions[acc.id]
                      ? 'bg-emerald-900/20 text-emerald-300 border-emerald-700/40'
                      : 'bg-red-900/20 text-red-300 border-red-700/40'
                  }`}>
                    {sessions[acc.id] ? 'Sesión activa' : 'Sesión expirada'}
                  </span>

                  <button
                    onClick={() => rescanGroups(acc.id, acc.name)}
                    disabled={rescanningIds.has(acc.id)}
                    title="Actualizar grupos"
                    className="p-1.5 text-neutral-500 hover:text-accent-400 hover:bg-accent-900/20 disabled:opacity-40 rounded-md transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 ${rescanningIds.has(acc.id) ? 'animate-spin' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </button>

                  <button
                    onClick={() => removeAccount(acc.id, acc.name)}
                    title="Eliminar cuenta"
                    className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CuentasScreen;
