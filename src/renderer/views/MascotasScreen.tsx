import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  nuevo:      { label: 'Nuevo',      dot: 'bg-orange-500',  text: 'text-orange-400' },
  revisado:   { label: 'Revisado',   dot: 'bg-blue-500',    text: 'text-blue-400' },
  contactado: { label: 'Contactado', dot: 'bg-emerald-500', text: 'text-emerald-400' },
  descartado: { label: 'Descartado', dot: 'bg-neutral-500', text: 'text-neutral-400' },
};

const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDayLabel(dateStr: string): string {
  const day = dateStr.split(' ')[0];
  const today = todayStr();
  if (day === today) return 'Hoy';

  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const yest = `${yd.getFullYear()}-${String(yd.getMonth()+1).padStart(2,'0')}-${String(yd.getDate()).padStart(2,'0')}`;
  if (day === yest) return 'Ayer';

  const [y, m, d2] = day.split('-').map(Number);
  const label = `${d2} de ${MONTHS_ES[m - 1]}`;
  return y === new Date().getFullYear() ? label : `${label} de ${y}`;
}

function parseImages(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

// ─── LIGHTBOX ─────────────────────────────────────────────────────────────────
// Visor de imagen en pantalla completa. Soporta navegación con flechas, ESC para
// cerrar, y zoom-fit automático (object-contain) para apreciar detalles sin recortar.
const Lightbox: React.FC<{
  images: string[];
  initialIndex: number;
  onClose: () => void;
}> = ({ images, initialIndex, onClose }) => {
  const [index, setIndex] = useState(initialIndex);

  const prev = useCallback(
    () => setIndex((i) => (i - 1 + images.length) % images.length),
    [images.length]
  );
  const next = useCallback(
    () => setIndex((i) => (i + 1) % images.length),
    [images.length]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  if (images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <img
        src={images[index]}
        alt=""
        className="max-w-[95vw] max-h-[95vh] object-contain select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Cerrar */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
        aria-label="Cerrar"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Abrir original (CDN) en pestaña externa por si quiere descargarla */}
      <a
        href={images[index]}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 right-16 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
        aria-label="Abrir original"
        title="Abrir original en navegador"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>

      {/* Prev / Next */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Anterior"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Siguiente"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/90 text-xs bg-black/40 px-3 py-1 rounded-full tabular-nums">
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
};

// ─── CONTEXT MENU ─────────────────────────────────────────────────────────────
const PetContextMenu: React.FC<{
  currentStatus: string;
  x: number;
  y: number;
  onSelect: (status: string) => void;
  onClose: () => void;
}> = ({ currentStatus, x, y, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const W = 172, H = 164;
  const left = x + W > window.innerWidth  ? x - W : x;
  const top  = y + H > window.innerHeight ? y - H : y;

  return (
    <div
      ref={ref}
      className="fixed z-[80] bg-neutral-800 border border-neutral-600/70 rounded-xl shadow-2xl py-1.5 overflow-hidden"
      style={{ left, top, minWidth: W }}
    >
      <p className="text-[9px] text-neutral-600 uppercase tracking-widest px-3 py-1">Cambiar estado</p>
      {STATUSES.map((s) => {
        const m = STATUS_META[s];
        const active = s === currentStatus;
        return (
          <button
            key={s}
            onMouseDown={(e) => { e.stopPropagation(); onSelect(s); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
              active ? 'bg-neutral-700/70' : 'hover:bg-neutral-700/40'
            } ${m.text}`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot} ${active ? '' : 'opacity-50'}`} />
            <span className={active ? 'font-medium' : ''}>{m.label}</span>
            {active && (
              <svg className="w-3 h-3 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ─── CARD ─────────────────────────────────────────────────────────────────────
const PetCard: React.FC<{
  pet: Pet;
  onClick: () => void;
  onRightClick: (x: number, y: number) => void;
}> = ({ pet, onClick, onRightClick }) => {
  const images = parseImages(pet.images);
  const thumb = images[0] ?? null;

  const statusColor: Record<string, string> = {
    nuevo: 'bg-accent-600',
    revisado: 'bg-blue-600',
    contactado: 'bg-emerald-600',
    descartado: 'bg-neutral-600',
  };

  return (
    <div
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onRightClick(e.clientX, e.clientY); }}
      title="Clic para ver detalle · Clic derecho para cambiar estado"
      className="group bg-neutral-800/60 rounded-xl border border-neutral-700/40 hover:border-neutral-500/60 hover:bg-neutral-800/90 transition-all cursor-pointer overflow-hidden flex flex-col"
    >
      {/* Imagen */}
      <div className="relative h-44 bg-neutral-900 flex-shrink-0">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = 'none';
              el.parentElement?.classList.add('no-img');
            }}
          />
        ) : null}
        {!thumb && (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* Badge de estado (esquina superior derecha) */}
        <span className={`absolute top-2 right-2 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full text-white ${statusColor[pet.status] ?? 'bg-neutral-600'}`}>
          {pet.status}
        </span>
        {/* Contador de imágenes */}
        {images.length > 1 && (
          <span className="absolute bottom-2 right-2 text-[9px] text-white bg-black/50 rounded px-1.5 py-0.5">
            +{images.length - 1} foto{images.length - 1 !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Contenido */}
      <div className="flex flex-col flex-1 p-3 gap-1">
        <p className="text-sm font-semibold text-neutral-100 truncate leading-tight">
          {pet.author_name || 'Anónimo'}
        </p>
        <p className="text-[10px] text-neutral-500 truncate">
          {pet.group_name}
        </p>
        {pet.text ? (
          <p className="text-[11.5px] text-neutral-300 leading-relaxed line-clamp-4 whitespace-pre-wrap break-words mt-1">
            {pet.text}
          </p>
        ) : (
          <p className="text-[11.5px] italic text-neutral-600 mt-1">(sin texto)</p>
        )}
      </div>
    </div>
  );
};

// ─── MODAL ────────────────────────────────────────────────────────────────────
const PetModal: React.FC<{
  pet: Pet;
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
  onNotesChange: (id: number, notes: string) => void;
  onDelete: (id: number) => void;
}> = ({ pet, onClose, onStatusChange, onNotesChange, onDelete }) => {
  const images = parseImages(pet.images);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Cerrar con Escape (solo si no hay lightbox abierto — el lightbox tiene su propio handler)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxIndex === null) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, lightboxIndex]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Galería de imágenes (click → lightbox).
            justify-center: si solo hay una imagen queda centrada; si hay varias y
            caben en el ancho del modal, también quedan centradas. "safe" evita que
            el contenido se corte por el lado izquierdo cuando sí desborda y hay scroll. */}
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto p-3 pb-2 [justify-content:safe_center]">
            {images.map((src, i) => (
              <button
                key={i}
                onClick={() => setLightboxIndex(i)}
                className="relative group flex-shrink-0 rounded-xl overflow-hidden bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-accent-500"
                title="Ver imagen completa"
              >
                <img
                  src={src}
                  alt=""
                  className="h-52 object-cover transition-transform group-hover:scale-[1.02]"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <svg className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="px-5 py-4 space-y-4">
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-neutral-100 leading-tight">
                {pet.author_name || 'Anónimo'}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">{pet.group_name}</p>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-600 hover:text-neutral-300 transition-colors flex-shrink-0 mt-0.5"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Texto completo */}
          {pet.text ? (
            <p className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap break-words">
              {pet.text}
            </p>
          ) : (
            <p className="text-sm italic text-neutral-600">(sin texto)</p>
          )}

          {/* Separador */}
          <div className="border-t border-neutral-800" />

          {/* Estado */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500 w-16 flex-shrink-0">Estado</span>
            <div className="flex gap-1.5 flex-wrap">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => onStatusChange(pet.id, s)}
                  className={`px-3 py-1 text-[11px] rounded-full border transition-colors ${
                    pet.status === s
                      ? 'bg-accent-600 border-accent-600 text-white'
                      : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div className="flex items-start gap-3">
            <span className="text-xs text-neutral-500 w-16 flex-shrink-0 pt-1.5">Notas</span>
            <textarea
              ref={notesRef}
              defaultValue={pet.notes}
              onBlur={(e) => onNotesChange(pet.id, e.target.value)}
              placeholder="Notas internas..."
              rows={2}
              className="flex-1 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-500 resize-none"
            />
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-between pt-1">
            <a
              href={pet.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Ver en Facebook
            </a>
            <button
              onClick={() => {
                if (confirm('¿Eliminar este registro?')) {
                  onDelete(pet.id);
                  onClose();
                }
              }}
              className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox montado al final para garantizar que esté encima del modal */}
      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
};

// ─── PANTALLA PRINCIPAL ───────────────────────────────────────────────────────
const MascotasScreen: React.FC = () => {
  const [pets, setPets] = useState<Pet[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0, nuevo: 0, revisado: 0, contactado: 0, descartado: 0 });
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ petId: number; x: number; y: number } | null>(null);

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

  const petsByDay = useMemo(() => {
    const groups = new Map<string, Pet[]>();
    for (const pet of filtered) {
      const day = (pet.collected_at || '').split(' ')[0] || 'unknown';
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(pet);
    }
    return Array.from(groups.entries()).map(([day, list]) => ({
      day,
      label: day === 'unknown' ? 'Fecha desconocida' : formatDayLabel(day),
      pets: list,
    }));
  }, [filtered]);

  const selectedPet = selectedId !== null ? pets.find((p) => p.id === selectedId) ?? null : null;

  const updateStatus = async (id: number, status: string) => {
    await window.api.updatePetStatus(id, status);
    await refresh();
  };

  const updateNotes = async (id: number, notes: string) => {
    await window.api.updatePetNotes(id, notes);
  };

  const removePet = async (id: number) => {
    await window.api.deletePet(id);
    await refresh();
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      {/* Encabezado */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-100">Mascotas recopiladas</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {counts.total} total · {counts.nuevo} nuevos · {counts.revisado} revisados · {counts.contactado} contactados · {counts.descartado} descartados
        </p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-1 bg-neutral-800 rounded-lg p-1 flex-shrink-0">
          {(['todos', ...STATUSES] as const).map((s) => (
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

      {/* Grid de cards */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-neutral-800/60 flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
            </div>
            <p className="text-sm text-neutral-400">
              {search ? 'Sin resultados para esa búsqueda.' : 'Aún no hay mascotas recopiladas.'}
            </p>
            {!search && (
              <p className="text-xs text-neutral-600 mt-1">Ejecuta una extracción desde la pestaña Extracción.</p>
            )}
          </div>
        ) : (
          <div className="space-y-7">
            {petsByDay.map(({ day, label, pets: dayPets }) => (
              <div key={day}>
                <div className="flex items-center gap-3 mb-3 sticky top-0 z-10 bg-neutral-900/80 backdrop-blur-sm py-1 -mx-1 px-1 rounded-lg">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                    {label}
                  </span>
                  <div className="flex-1 h-px bg-neutral-800" />
                  <span className="text-[10px] text-neutral-600 whitespace-nowrap">
                    {dayPets.length} post{dayPets.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                  {dayPets.map((pet) => (
                    <PetCard
                      key={pet.id}
                      pet={pet}
                      onClick={() => setSelectedId(pet.id)}
                      onRightClick={(x, y) => setCtxMenu({ petId: pet.id, x, y })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de detalle */}
      {selectedPet && (
        <PetModal
          pet={selectedPet}
          onClose={() => setSelectedId(null)}
          onStatusChange={updateStatus}
          onNotesChange={updateNotes}
          onDelete={removePet}
        />
      )}

      {/* Menú contextual de estado */}
      {ctxMenu && (() => {
        const pet = pets.find((p) => p.id === ctxMenu.petId);
        if (!pet) return null;
        return (
          <PetContextMenu
            currentStatus={pet.status}
            x={ctxMenu.x}
            y={ctxMenu.y}
            onSelect={(s) => updateStatus(ctxMenu.petId, s)}
            onClose={() => setCtxMenu(null)}
          />
        );
      })()}
    </div>
  );
};

export default MascotasScreen;
