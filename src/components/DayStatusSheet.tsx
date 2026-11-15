import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Habit, LogStatus } from '../db/types';
import { incrementCount, setChecklistAll, setLogNote, setStatus, toggleChecklistItem } from '../db/repo';
import type { HabitIndex } from '../domain/habits';
import { type DateKey, formatLong } from '../lib/dates';
import { Sheet } from './ui';
import { HabitIcon } from './icons';

const OPTIONS: { value: LogStatus; label: string; hint: string }[] = [
  { value: 'done', label: 'Completo', hint: 'Lo hice completo' },
  { value: 'min', label: 'Mínimo', hint: 'Hice la versión mínima' },
  { value: 'pending', label: 'Pendiente', hint: 'Aún no' },
  { value: 'skipped', label: 'Saltado', hint: 'No lo hice (cuenta como no cumplido)' },
  { value: 'rest', label: 'Descanso', hint: 'Día libre: no cuenta ni rompe rachas' },
];

/** Edit a habit's record for any date (today or past). */
export function DayStatusSheet({
  habit, date, idx, onClose,
}: { habit: Habit | null; date: DateKey; idx: HabitIndex; onClose: () => void }) {
  const log = habit ? idx.log(habit.id, date) : undefined;
  const [note, setNote] = useState(log?.note ?? '');
  useEffect(() => {
    setNote(log?.note ?? '');
  }, [habit?.id, date]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!habit) return null;
  const status = log?.status ?? 'pending';
  const count = log?.count ?? 0;
  const checked = new Set(log?.checked ?? []);

  return (
    <Sheet open onClose={onClose} title={habit.name}>
      <div className="flex items-center gap-2 text-sm text-muted -mt-1 mb-4">
        <HabitIcon name={habit.icon} size={16} />
        <span>{formatLong(date)}</span>
      </div>

      {habit.kind === 'counter' && (
        <div className="card2 p-3 mb-3 flex items-center justify-between">
          <span className="text-sm">
            {count} de {habit.counterTarget ?? 1} {habit.counterUnit ?? ''}
          </span>
          <div className="flex gap-2">
            <button className="icon-btn bg-card border border-line2" aria-label="Quitar uno" onClick={() => incrementCount(habit, date, -1)}>
              <Minus size={18} />
            </button>
            <button className="icon-btn bg-violet text-white" aria-label="Sumar uno" onClick={() => incrementCount(habit, date, 1)}>
              <Plus size={18} />
            </button>
          </div>
        </div>
      )}

      {habit.kind === 'checklist' && (habit.checklist?.length ?? 0) > 0 && (
        <div className="card2 p-2 mb-3">
          {habit.checklist!.map((it) => (
            <label key={it.id} className="flex items-center gap-3 min-h-[44px] px-2">
              <input
                type="checkbox"
                className="w-5 h-5 accent-[#8B5CF6]"
                checked={checked.has(it.id)}
                onChange={() => toggleChecklistItem(habit, date, it.id)}
              />
              <span className="flex-1 min-w-0">
                <span className="text-sm block">{it.name}</span>
                {(it.note || it.timeOfDay) && (
                  <span className="text-[12px] text-muted block truncate">
                    {[it.note, it.timeOfDay].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              {it.essential && <span className="text-[11px] text-blue-text">Esencial</span>}
            </label>
          ))}
          <div className="flex gap-2 p-2">
            <button className="pill-ghost flex-1" onClick={() => setChecklistAll(habit, date, true)}>Marcar todos</button>
            <button className="pill-ghost flex-1" onClick={() => setChecklistAll(habit, date, false)}>Limpiar</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {OPTIONS.filter((o) => o.value !== 'min' || habit.minVersion || habit.kind === 'checklist').map((o) => (
          <button
            key={o.value}
            onClick={() => setStatus(habit.id, date, o.value)}
            className={`w-full text-left rounded-2xl border px-4 py-3 min-h-[52px] transition ${
              status === o.value ? 'border-violet bg-violet-soft' : 'border-line2 bg-card2'
            }`}
          >
            <div className="text-[15px] font-medium">
              {o.label}
              {o.value === 'min' && habit.minVersion ? <span className="text-muted font-normal"> · {habit.minVersion}</span> : null}
            </div>
            <div className="text-[12px] text-muted">{o.hint}</div>
          </button>
        ))}
      </div>

      <label className="label mt-4">Nota (opcional)</label>
      <input
        className="field"
        value={note}
        placeholder="Algo que quieras recordar de este día"
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (log?.note ?? '') && setLogNote(habit.id, date, note)}
      />
      <button className="pill-primary w-full mt-4" onClick={() => { if (note !== (log?.note ?? '')) setLogNote(habit.id, date, note); onClose(); }}>
        Listo
      </button>
    </Sheet>
  );
}
