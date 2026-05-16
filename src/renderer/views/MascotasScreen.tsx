import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const STATUS_META: Record<string, { label: string; dot: string; text: string; badge: string }> = {
  nuevo:      { label: 'Nuevo',      dot: 'bg-orange-500',  text: 'text-orange-400',  badge: 'bg-orange-500' },
  revisado:   { label: 'Revisado',   dot: 'bg-blue-500',    text: 'text-blue-400',    badge: 'bg-blue-600' },
  contactado: { label: 'Contactado', dot: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-600' },
  descartado: { label: 'Descartado', dot: 'bg-neutral-500', text: 'text-neutral-400', badge: 'bg-neutral-600' },
};

const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function parseImages(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

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

function groupByDay(list: Pet[]): Array<{ day: string; label: string; pets: Pet[] }> {
  const groups = new Map<string, Pet[]>();
  for (const pet of list) {
    const day = (pet.collected_at || '').split(' ')[0] || 'unknown';
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(pet);
  }
  return Array.from(groups.entries()).map(([day, pets]) => ({
    day,
    label: day === 'unknown' ? 'Fecha desconocida' : formatDayLabel(day),
    pets,
  }));
}

// ─── LIGHTBOX ─────────────────────────────────────────────────────────────────
const Lightbox: React.FC<{
  images: string[];
  initialIndex: number;
  onClose: () => void;
}> = ({ images, initialIndex, onClose }) => {
  const [index, setIndex] = useState(initialIndex);
  const prev = useCallback(() => setIndex((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, prev, next]);

  if (images.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center" onClick={onClose}>
      <img src={images[index]} alt="" className="max-w-[95vw] max-h-[95vh] object-contain select-none" onClick={(e) => e.stopPropagation()} draggable={false} />
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
      <a href={images[index]} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="absolute top-4 right-16 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors" title="Abrir original">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
      </a>
      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
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
    const onMouse = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const W = 172, H = 170;
  const left = x + W > window.innerWidth  ? x - W : x;
  const top  = y + H > window.innerHeight ? y - H : y;

  return (
    <div ref={ref} className="fixed z-[80] bg-neutral-800 border border-neutral-600/70 rounded-xl shadow-2xl py-1.5 overflow-hidden" style={{ left, top, minWidth: W }}>
      <p className="text-[9px] text-neutral-600 uppercase tracking-widest px-3 py-1">Cambiar estado</p>
      {STATUSES.map((s) => {
        const m = STATUS_META[s];
        const active = s === currentStatus;
        return (
          <button key={s} onMouseDown={(e) => { e.stopPropagation(); onSelect(s); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${active ? 'bg-neutral-700/70' : 'hover:bg-neutral-700/40'} ${m.text}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot} ${active ? '' : 'opacity-50'}`} />
            <span className={active ? 'font-medium' : ''}>{m.label}</span>
            {active && <svg className="w-3 h-3 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </button>
        );
      })}
    </div>
  );
};

// ─── PET CARD ─────────────────────────────────────────────────────────────────
const PetCard: React.FC<{
  pet: Pet;
  showQuickActions?: boolean;
  onClick: () => void;
  onRightClick: (x: number, y: number) => void;
  onQuickStatus?: (id: number, status: string) => void;
}> = ({ pet, showQuickActions, onClick, onRightClick, onQuickStatus }) => {
  const images = parseImages(pet.images);
  const thumb = images[0] ?? null;
  const m = STATUS_META[pet.status] ?? STATUS_META.nuevo;

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
          <img src={thumb} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* Badge estado */}
        <span className={`absolute top-2 right-2 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full text-white ${m.badge}`}>
          {pet.status}
        </span>
        {images.length > 1 && (
          <span className="absolute bottom-2 right-2 text-[9px] text-white bg-black/50 rounded px-1.5 py-0.5">
            +{images.length - 1} foto{images.length - 1 !== 1 ? 's' : ''}
          </span>
        )}

        {/* Acciones rápidas — overlay en la parte inferior de la imagen */}
        {showQuickActions && (
          <div className="absolute bottom-0 left-0 right-0 flex opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {([
              { status: 'revisado',   label: 'Revisado',   hoverBg: 'hover:bg-blue-600/90',    icon: (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              )},
              { status: 'contactado', label: 'Contactado', hoverBg: 'hover:bg-emerald-600/90', icon: (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              )},
              { status: 'descartado', label: 'Descartar',  hoverBg: 'hover:bg-neutral-600/90', icon: (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              )},
            ] as const).map(({ status, label, hoverBg, icon }) => (
              <button
                key={status}
                onClick={(e) => { e.stopPropagation(); onQuickStatus?.(pet.id, status); }}
                title={label}
                className={`flex-1 py-2.5 bg-black/75 ${hoverBg} text-white/80 hover:text-white transition-colors flex items-center justify-center`}
              >
                {icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="flex flex-col flex-1 p-3 gap-1">
        <p className="text-sm font-semibold text-neutral-100 truncate leading-tight">{pet.author_name || 'Anónimo'}</p>
        <p className="text-[10px] text-neutral-500 truncate">{pet.group_name}</p>
        {pet.text ? (
          <p className="text-[11.5px] text-neutral-300 leading-relaxed line-clamp-4 whitespace-pre-wrap break-words mt-1">{pet.text}</p>
        ) : (
          <p className="text-[11.5px] italic text-neutral-600 mt-1">(sin texto)</p>
        )}
      </div>
    </div>
  );
};

// ─── PET MODAL ────────────────────────────────────────────────────────────────
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

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && lightboxIndex === null) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, lightboxIndex]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto p-3 pb-2 [justify-content:safe_center]">
            {images.map((src, i) => (
              <button key={i} onClick={() => setLightboxIndex(i)}
                className="relative group flex-shrink-0 rounded-xl overflow-hidden bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-accent-500" title="Ver imagen completa">
                <img src={src} alt="" className="h-52 object-cover transition-transform group-hover:scale-[1.02]" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <svg className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6" /></svg>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-neutral-100 leading-tight">{pet.author_name || 'Anónimo'}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{pet.group_name}</p>
            </div>
            <button onClick={onClose} className="text-neutral-600 hover:text-neutral-300 transition-colors flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {pet.text ? (
            <p className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap break-words">{pet.text}</p>
          ) : (
            <p className="text-sm italic text-neutral-600">(sin texto)</p>
          )}
          <div className="border-t border-neutral-800" />
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500 w-16 flex-shrink-0">Estado</span>
            <div className="flex gap-1.5 flex-wrap">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => onStatusChange(pet.id, s)}
                  className={`px-3 py-1 text-[11px] rounded-full border transition-colors ${pet.status === s ? 'bg-accent-600 border-accent-600 text-white' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'}`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xs text-neutral-500 w-16 flex-shrink-0 pt-1.5">Notas</span>
            <textarea ref={notesRef} defaultValue={pet.notes} onBlur={(e) => onNotesChange(pet.id, e.target.value)}
              placeholder="Notas internas..." rows={2}
              className="flex-1 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-500 resize-none" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <a href={pet.post_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              Ver en Facebook
            </a>
            <button onClick={() => { if (confirm('¿Eliminar este registro?')) { onDelete(pet.id); onClose(); } }}
              className="text-xs text-neutral-500 hover:text-red-400 transition-colors">
              Eliminar
            </button>
          </div>
        </div>
      </div>
      {lightboxIndex !== null && <Lightbox images={images} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />}
    </div>
  );
};

// ─── DAY GROUP ────────────────────────────────────────────────────────────────
const DayGroup: React.FC<{ label: string; count: number; children: React.ReactNode }> = ({ label, count, children }) => (
  <div>
    <div className="flex items-center gap-3 mb-3 sticky top-0 z-10 bg-neutral-900/90 backdrop-blur-sm py-1.5 -mx-1 px-1 rounded-lg">
      <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-neutral-800" />
      <span className="text-[10px] text-neutral-600 whitespace-nowrap">{count} post{count !== 1 ? 's' : ''}</span>
    </div>
    <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
      {children}
    </div>
  </div>
);

// ─── BANDEJA VIEW ─────────────────────────────────────────────────────────────
const BandejaView: React.FC<{
  groups: Array<{ day: string; label: string; pets: Pet[] }>;
  totalNuevo: number;
  search: string;
  onOpenPet: (id: number) => void;
  onRightClick: (petId: number, x: number, y: number) => void;
  onQuickStatus: (id: number, status: string) => void;
  onMarkAllRevisado: () => void;
}> = ({ groups, totalNuevo, search, onOpenPet, onRightClick, onQuickStatus, onMarkAllRevisado }) => {
  const displayed = groups.reduce((acc, g) => acc + g.pets.length, 0);

  if (totalNuevo === 0 && !search.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-neutral-300">Todo al día</p>
        <p className="text-xs text-neutral-500 mt-1">No hay publicaciones pendientes de revisar.</p>
        <p className="text-xs text-neutral-700 mt-0.5">Los nuevos posts aparecerán aquí tras cada extracción.</p>
      </div>
    );
  }

  if (displayed === 0 && search.trim()) {
    return (
      <div className="pt-3 flex flex-col items-center justify-center py-16 text-center">
        <svg className="w-8 h-8 text-neutral-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <p className="text-sm text-neutral-400">Sin resultados en la bandeja</p>
        <p className="text-xs text-neutral-600 mt-1">No hay posts nuevos que coincidan con <span className="text-neutral-400">"{search}"</span></p>
      </div>
    );
  }

  return (
    <div className="pt-3">
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-neutral-500">
          {search.trim()
            ? <><span className="font-medium text-neutral-300">{displayed}</span> resultado{displayed !== 1 ? 's' : ''} · buscando en bandeja</>
            : <><span className="font-bold text-orange-400 tabular-nums">{totalNuevo}</span> publicacion{totalNuevo !== 1 ? 'es' : ''} sin revisar</>
          }
        </p>
        {totalNuevo > 0 && !search.trim() && (
          <button
            onClick={() => { if (confirm(`¿Marcar las ${totalNuevo} publicaciones como revisadas?`)) onMarkAllRevisado(); }}
            className="text-[11px] text-neutral-500 hover:text-blue-400 transition-colors px-2.5 py-1 rounded-lg hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20"
          >
            Marcar todo como revisado
          </button>
        )}
      </div>
      <div className="space-y-7">
        {groups.map(({ day, label, pets }) => (
          <DayGroup key={day} label={label} count={pets.length}>
            {pets.map((pet) => (
              <PetCard key={pet.id} pet={pet} showQuickActions
                onClick={() => onOpenPet(pet.id)}
                onRightClick={(x, y) => onRightClick(pet.id, x, y)}
                onQuickStatus={onQuickStatus}
              />
            ))}
          </DayGroup>
        ))}
      </div>
    </div>
  );
};

// ─── ARCHIVO VIEW ─────────────────────────────────────────────────────────────
const ARCHIVO_TABS = [
  { key: 'todos',      label: 'Todos' },
  { key: 'revisado',   label: 'Revisados' },
  { key: 'contactado', label: 'Contactados' },
  { key: 'descartado', label: 'Descartados' },
] as const;

const ArchivoView: React.FC<{
  groups: Array<{ day: string; label: string; pets: Pet[] }>;
  filter: string;
  search: string;
  onFilterChange: (f: string) => void;
  onOpenPet: (id: number) => void;
  onRightClick: (petId: number, x: number, y: number) => void;
}> = ({ groups, filter, search, onFilterChange, onOpenPet, onRightClick }) => {
  const total = groups.reduce((acc, g) => acc + g.pets.length, 0);

  return (
    <div className="pt-3">
      <div className="flex items-center gap-1.5 mb-5 bg-neutral-800/60 rounded-lg p-1 w-fit">
        {ARCHIVO_TABS.map(({ key, label }) => (
          <button key={key} onClick={() => onFilterChange(key)}
            className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${filter === key ? 'bg-neutral-700 text-neutral-100 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {total === 0 && !search.trim() ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-neutral-800/60 flex items-center justify-center mb-3">
            <svg className="w-7 h-7 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <p className="text-sm text-neutral-400">El archivo está vacío.</p>
          <p className="text-xs text-neutral-600 mt-1">Las publicaciones gestionadas (revisadas, contactadas o descartadas) aparecerán aquí.</p>
        </div>
      ) : total === 0 && search.trim() ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-8 h-8 text-neutral-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <p className="text-sm text-neutral-400">Sin resultados en el archivo</p>
          <p className="text-xs text-neutral-600 mt-1">No hay posts que coincidan con <span className="text-neutral-400">"{search}"</span></p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(({ day, label, pets }) => (
            <DayGroup key={day} label={label} count={pets.length}>
              {pets.map((pet) => (
                <PetCard key={pet.id} pet={pet}
                  onClick={() => onOpenPet(pet.id)}
                  onRightClick={(x, y) => onRightClick(pet.id, x, y)}
                />
              ))}
            </DayGroup>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── PANTALLA PRINCIPAL ───────────────────────────────────────────────────────
const MascotasScreen: React.FC = () => {
  const [pets, setPets] = useState<Pet[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0, nuevo: 0, revisado: 0, contactado: 0, descartado: 0 });
  const [activeTab, setActiveTab] = useState<'bandeja' | 'archivo'>('bandeja');
  const [archivoFilter, setArchivoFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ petId: number; x: number; y: number } | null>(null);

  const refresh = useCallback(async () => {
    const list = (await window.api.getPets()) as Pet[];
    setPets(list);
    const c = (await window.api.getPetCounts()) as Record<string, number>;
    setCounts(c);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = window.api.onDataChanged(refresh);
    return unsub;
  }, [refresh]);

  const bandejaPets = useMemo(() => pets.filter((p) => p.status === 'nuevo'), [pets]);
  const archivoPets = useMemo(() => {
    const base = pets.filter((p) => p.status !== 'nuevo');
    return archivoFilter === 'todos' ? base : base.filter((p) => p.status === archivoFilter);
  }, [pets, archivoFilter]);

  const bandejaByDay = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? bandejaPets.filter((p) =>
          p.text.toLowerCase().includes(q) ||
          p.author_name.toLowerCase().includes(q) ||
          p.group_name.toLowerCase().includes(q)
        )
      : bandejaPets;
    return groupByDay(filtered);
  }, [bandejaPets, search]);

  const archivoByDay = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? archivoPets.filter((p) =>
          p.text.toLowerCase().includes(q) ||
          p.author_name.toLowerCase().includes(q) ||
          p.group_name.toLowerCase().includes(q)
        )
      : archivoPets;
    return groupByDay(filtered);
  }, [archivoPets, search]);

  const selectedPet = selectedId !== null ? pets.find((p) => p.id === selectedId) ?? null : null;

  const updateStatus = useCallback(async (id: number, status: string) => {
    await window.api.updatePetStatus(id, status);
    await refresh();
  }, [refresh]);

  const markAllRevisado = useCallback(async () => {
    await Promise.all(bandejaPets.map((p) => window.api.updatePetStatus(p.id, 'revisado')));
    await refresh();
  }, [bandejaPets, refresh]);

  const updateNotes = async (id: number, notes: string) => { await window.api.updatePetNotes(id, notes); };
  const removePet = async (id: number) => { await window.api.deletePet(id); await refresh(); };

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-0 flex-shrink-0 space-y-3">

        {/* Título + búsqueda */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Mascotas</h2>
            <p className="text-xs text-neutral-500 mt-0.5">{counts.total} publicaciones recopiladas en total</p>
          </div>
          <div className="relative max-w-64 w-full">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por usuario o texto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg pl-8 pr-7 py-2 focus:outline-none focus:border-accent-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                aria-label="Limpiar búsqueda"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Stats chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: 'nuevo',      label: 'Por revisar', bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  num: 'text-orange-400' },
            { key: 'revisado',   label: 'Revisados',   bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    num: 'text-blue-400' },
            { key: 'contactado', label: 'Contactados', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', num: 'text-emerald-400' },
            { key: 'descartado', label: 'Descartados', bg: 'bg-neutral-800/60', border: 'border-neutral-700/40', num: 'text-neutral-400' },
          ] as const).map(({ key, label, bg, border, num }) => (
            <div key={key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] ${bg} ${border}`}>
              <span className={`font-bold tabular-nums ${num}`}>{counts[key] ?? 0}</span>
              <span className="text-neutral-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-neutral-800 -mb-px">
          {([
            { id: 'bandeja' as const, label: 'Bandeja de entrada', badge: (counts.nuevo ?? 0) > 0 ? counts.nuevo : null },
            { id: 'archivo' as const, label: 'Archivo', badge: null },
          ]).map(({ id, label, badge }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`relative px-4 py-2.5 text-xs font-medium transition-colors ${activeTab === id ? 'text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'}`}>
              {label}
              {badge !== null && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-orange-500 text-white text-[9px] font-bold px-1 tabular-nums">
                  {badge}
                </span>
              )}
              {activeTab === id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-500 rounded-t-full" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
        {activeTab === 'bandeja' ? (
          <BandejaView
            groups={bandejaByDay}
            totalNuevo={counts.nuevo ?? 0}
            search={search}
            onOpenPet={setSelectedId}
            onRightClick={(petId, x, y) => setCtxMenu({ petId, x, y })}
            onQuickStatus={updateStatus}
            onMarkAllRevisado={markAllRevisado}
          />
        ) : (
          <ArchivoView
            groups={archivoByDay}
            filter={archivoFilter}
            search={search}
            onFilterChange={setArchivoFilter}
            onOpenPet={setSelectedId}
            onRightClick={(petId, x, y) => setCtxMenu({ petId, x, y })}
          />
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

      {/* Menú contextual */}
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
