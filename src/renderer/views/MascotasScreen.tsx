import React, { useCallback, useEffect, useMemo, useState } from 'react';
import StatusBadge from '../components/StatusBadge';

interface Pet {
  id: number;
  group_id: number;
  group_name: string;
  group_url: string;
  post_url: string;
  author_name: string;
  author_url: string;
  text: string;
  images: string;
  published_at: string;
  collected_at: string;
  status: string;
  notes: string;
}

const STATUSES = ['nuevo', 'revisado', 'contactado', 'descartado'] as const;

const MascotasScreen: React.FC = () => {
  const [pets, setPets] = useState<Pet[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0, nuevo: 0, revisado: 0, contactado: 0, descartado: 0 });
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const filter = statusFilter === 'todos' ? undefined : { status: statusFilter };
    const list = (await window.api.getPets(filter)) as Pet[];
    setPets(list);
    const c = (await window.api.getPetCounts()) as Record<string, number>;
    setCounts(c);
  }, [statusFilter]);

  useEffect(() => {
    refresh();
    const unsub = window.api.onDataChanged(refresh);
    return unsub;
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!search.trim()) return pets;
    const q = search.toLowerCase();
    return pets.filter((p) =>
      p.text.toLowerCase().includes(q) ||
      p.author_name.toLowerCase().includes(q) ||
      p.group_name.toLowerCase().includes(q)
    );
  }, [pets, search]);

  const updateStatus = async (id: number, status: string) => {
    await window.api.updatePetStatus(id, status);
    await refresh();
  };

  const updateNotes = async (id: number, notes: string) => {
    await window.api.updatePetNotes(id, notes);
  };

  const removePet = async (id: number) => {
    if (!confirm('¿Eliminar este registro?')) return;
    await window.api.deletePet(id);
    await refresh();
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-100">Mascotas recopiladas</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Total: {counts.total} · Nuevos: {counts.nuevo} · Revisados: {counts.revisado} · Contactados: {counts.contactado} · Descartados: {counts.descartado}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1 bg-neutral-800 rounded-lg p-1">
          {['todos', ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                statusFilter === s
                  ? 'bg-accent-600 text-white'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar en texto, autor o grupo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 text-sm">
            No hay registros. Ejecuta una extracción desde la pestaña Extracción.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((pet) => {
              const images = (() => {
                try { return JSON.parse(pet.images) as string[]; } catch { return []; }
              })();
              const isOpen = expanded === pet.id;
              return (
                <div
                  key={pet.id}
                  className="bg-neutral-800/60 rounded-lg border border-neutral-700/40 overflow-hidden"
                >
                  <div className="flex gap-3 p-3">
                    {images[0] && (
                      <img
                        src={images[0]}
                        alt=""
                        className="w-20 h-20 object-cover rounded-md flex-shrink-0 bg-neutral-900"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0">
                          <div className="text-[11px] text-neutral-400">
                            <span className="text-neutral-200 font-medium">{pet.author_name || 'Anónimo'}</span>
                            <span className="mx-1.5">·</span>
                            <span>{pet.group_name}</span>
                            {pet.published_at && (
                              <>
                                <span className="mx-1.5">·</span>
                                <span>{pet.published_at}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={pet.status} />
                      </div>
                      {/* Texto completo siempre. whitespace-pre-wrap respeta saltos de línea originales. */}
                      <div className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap break-words">
                        {pet.text || <span className="italic text-neutral-600">(sin texto)</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <a
                          href={pet.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-accent-400 hover:text-accent-300 underline"
                        >
                          Ver post en Facebook
                        </a>
                        <span className="text-[10px] text-neutral-600">·</span>
                        <button
                          onClick={() => setExpanded(isOpen ? null : pet.id)}
                          className="text-[10px] text-neutral-400 hover:text-neutral-200"
                        >
                          {isOpen ? 'Ocultar detalles' : 'Ver detalles'}
                        </button>
                        <span className="text-[10px] text-neutral-600">·</span>
                        <button
                          onClick={() => removePet(pet.id)}
                          className="text-[10px] text-neutral-500 hover:text-red-400"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-neutral-700/40 px-3 py-3 bg-neutral-900/40">
                      {images.length > 1 && (
                        <div className="flex gap-2 mb-3 overflow-x-auto">
                          {images.map((src, i) => (
                            <img
                              key={i}
                              src={src}
                              alt=""
                              className="h-24 rounded-md flex-shrink-0 bg-neutral-800"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-neutral-500">Estado:</span>
                        <select
                          value={pet.status}
                          onChange={(e) => updateStatus(pet.id, e.target.value)}
                          className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-[11px] rounded px-2 py-1 focus:outline-none focus:border-accent-500"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        placeholder="Notas (gestión interna)..."
                        defaultValue={pet.notes}
                        onBlur={(e) => updateNotes(pet.id, e.target.value)}
                        rows={2}
                        className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 text-[11px] rounded p-2 focus:outline-none focus:border-accent-500 resize-none"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MascotasScreen;
