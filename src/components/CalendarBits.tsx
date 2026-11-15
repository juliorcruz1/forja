import type { DayInfo, DayKind } from '../domain/calendar';

/** Each state has its own shape AND color, so it reads without relying on color alone. */
const SHAPE: Record<DayKind, string> = {
  perfect: 'bg-violet text-white rounded-full',
  partial: 'bg-blue-soft border-2 border-blue text-blue-text rounded-full',
  open: 'border-2 border-dashed border-violet text-ink rounded-full',
  missed: 'bg-line2 text-muted rounded-[0.375rem]',
  rest: 'border border-dashed border-dim text-dim rounded-full',
  empty: 'text-dim',
  future: 'text-dim',
};

export const KIND_LABEL: Record<DayKind, string> = {
  perfect: 'Día perfecto',
  partial: 'Parcial',
  open: 'En curso',
  missed: 'Sin cumplir',
  rest: 'Descanso',
  empty: 'Sin hábitos obligatorios',
  future: 'Por venir',
};

export function DayShape({ kind, today, children, className = '' }: { kind: DayKind; today?: boolean; children?: React.ReactNode; className?: string }) {
  const ring = today ? 'ring-2 ring-ink/80 ring-offset-2 ring-offset-bg' : '';
  return <span className={`flex items-center justify-center font-medium ${SHAPE[kind]} ${ring} ${className}`}>{children}</span>;
}

/** Tiny markers under a day: work day (line) and weekly habits like Gym (square: filled = done, hollow = planned). */
export function DayMarks({ day }: { day: DayInfo }) {
  const w = day.weekly[0];
  return (
    <span className="flex items-center justify-center gap-1 h-[0.375rem]">
      {day.work && <span className="w-2 h-[2px] rounded-full bg-dim" />}
      {w && (
        <span
          className={`w-[0.375rem] h-[0.375rem] rounded-[1px] ${w.done ? 'bg-violet-text' : day.kind === 'future' ? 'border border-muted' : 'border border-dim'}`}
        />
      )}
    </span>
  );
}

export function CalendarLegend({ weeklyName }: { weeklyName?: string }) {
  const items: { kind: DayKind; label: string }[] = [
    { kind: 'perfect', label: 'Perfecto' },
    { kind: 'partial', label: 'Parcial' },
    { kind: 'missed', label: 'Sin cumplir' },
    { kind: 'rest', label: 'Descanso' },
    { kind: 'open', label: 'Hoy en curso' },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[0.75rem] text-muted">
      {items.map((i) => (
        <span key={i.kind} className="flex items-center gap-1.5">
          <DayShape kind={i.kind} className="w-4 h-4" />
          {i.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="w-[0.5rem] h-[0.5rem] rounded-[1px] bg-violet-text" /> {weeklyName ?? 'Gym'} hecho
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-[0.5rem] h-[0.5rem] rounded-[1px] border border-muted" /> {weeklyName ?? 'Gym'} planeado
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-[2px] rounded-full bg-dim" /> Trabajo
      </span>
    </div>
  );
}
