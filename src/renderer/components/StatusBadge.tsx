import React from 'react';

type Status = 'nuevo' | 'revisado' | 'descartado' | 'contactado';

const STYLES: Record<Status, string> = {
  nuevo: 'bg-accent-600/20 text-accent-300 border-accent-500/40',
  revisado: 'bg-neutral-700/40 text-neutral-300 border-neutral-600/40',
  contactado: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40',
  descartado: 'bg-red-700/20 text-red-300 border-red-500/40',
};

const LABELS: Record<Status, string> = {
  nuevo: 'Nuevo',
  revisado: 'Revisado',
  contactado: 'Contactado',
  descartado: 'Descartado',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = (status as Status) in STYLES ? (status as Status) : 'nuevo';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium border ${STYLES[s]}`}>
      {LABELS[s]}
    </span>
  );
};

export default StatusBadge;
