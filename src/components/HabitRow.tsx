import { Check, Plus } from 'lucide-react';
import type { Habit } from '../db/types';
import { Link } from 'react-router-dom';
import { incrementCount, setChecklistAll, setStatus, toggleChecklistItem, toggleDone } from '../db/repo';
import { evalDay, type HabitIndex, isDoneStatus, weeklyGoal } from '../domain/habits';
import { nightInfo } from '../domain/sleep';
import type { DateKey } from '../lib/dates';
import { formatTime } from '../lib/dates';
import type { Settings } from '../db/types';
import { HabitIcon } from './icons';
import { Bar, StatusCircle } from './ui';

interface Props {
  habit: Habit;
  date: DateKey;
  today: DateKey;
  idx: HabitIndex;
  settings: Settings;
  heavy: boolean;
  onOpen: () => void;
}

export function HabitRow({ habit, date, today, idx, settings, heavy, onOpen }: Props) {
  const log = idx.log(habit.id, date);
  const status = log?.status ?? 'pending';
  const done = isDoneStatus(status);
  const optional = !habit.required;
  const count = log?.count ?? 0;
  const target = habit.counterTarget ?? 1;
  const items = habit.checklist ?? [];
  const checked = new Set(log?.checked ?? []);

  const sub: string[] = [];
  if (habit.oneOffDate) sub.push(habit.oneOffDate === today ? 'Solo para hoy' : 'Solo este día');
  if (heavy && habit.minVersion && !done) sub.push(`Mínimo: ${habit.minVersion}`);
  if (habit.frequency.type === 'weekly') {
    const g = weeklyGoal(habit, idx, today);
    sub.push(g.state === 'met' ? `¡Meta semanal cumplida! ${g.count} de ${g.target}` : `Llevas ${g.count} de ${g.target} esta semana`);
    if (g.planned.length > 0 && !evalDay(habit, date, idx, today).counts && !done && g.state !== 'met' && date === today) sub.push('hoy no planeado');
  }
  if (habit.sleepLinked) {
    const n = nightInfo(settings, date);
    sub.push(`Acuéstate a las ${formatTime(n.bedtime)}`);
  }
  if (habit.stackAfter && !heavy) sub.push(`Después de ${habit.stackAfter.replace(/^después de\s*/i, '')}`);
  if (habit.kind === 'counter') sub.push(`${count} de ${target} ${habit.counterUnit ?? ''}`.trim());
  if (status === 'rest') sub.unshift('Descanso');
  if (status === 'skipped') sub.unshift('Saltado');

  const onCircle = () => {
    if (status === 'rest' || status === 'skipped') return setStatus(habit.id, date, 'pending');
    if (habit.kind === 'checklist' && items.length > 0 && !done) {
      return setChecklistAll(habit, date, !heavy).then(() => (heavy ? setStatus(habit.id, date, 'min') : undefined));
    }
    return toggleDone(habit, date, heavy && !!habit.minVersion);
  };

  return (
    <div className={`card p-3.5 transition ${done ? 'border-line' : ''}`}>
      <div className="flex items-center gap-3">
        <StatusCircle status={status} optional={optional} onClick={onCircle} label={`${done ? 'Desmarcar' : 'Marcar'} ${habit.name}`} />
        <button className="flex-1 min-w-0 text-left min-h-[44px] flex flex-col justify-center" onClick={onOpen}>
          <span className="flex items-center gap-2">
            <HabitIcon name={habit.icon} size={16} className={done ? 'text-violet-text' : 'text-muted'} />
            <span className={`font-medium truncate ${done ? 'text-muted' : ''}`}>{habit.name}</span>
            {status === 'min' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-soft text-blue-text shrink-0">Mínimo</span>}
          </span>
          {sub.length > 0 && <span className="text-[12px] text-muted truncate mt-0.5">{sub.join(' · ')}</span>}
        </button>
        {habit.kind === 'counter' ? (
          <button
            className="w-11 h-11 rounded-full bg-violet-soft text-violet-text flex items-center justify-center active:scale-90 transition shrink-0"
            aria-label={`Sumar uno a ${habit.name}`}
            onClick={() => incrementCount(habit, date)}
          >
            <Plus size={20} />
          </button>
        ) : (
          habit.minVersion && !done && !heavy && status === 'pending' && (
            <button className="chip-off text-[12px] shrink-0" onClick={() => setStatus(habit.id, date, 'min')} aria-label={`Hice el mínimo de ${habit.name}`}>
              Mínimo
            </button>
          )
        )}
      </div>

      {habit.kind === 'counter' && <Bar pct={(count / target) * 100} className="mt-3 ml-[52px]" color={count >= target ? 'violet' : 'blue'} />}

      {habit.kind === 'checklist' && (
        <div className="mt-2 ml-[52px]">
          {items.length === 0 ? (
            <Link to={`/habitos/${habit.id}/editar`} className="text-[12px] text-blue-text min-h-[32px] inline-flex items-center">
              Agrega tu lista aquí
            </Link>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {items.map((it) => {
                const on = checked.has(it.id);
                return (
                  <button
                    key={it.id}
                    onClick={() => toggleChecklistItem(habit, date, it.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-[36px] text-[13px] border transition ${
                      on ? 'bg-violet-soft border-violet text-violet-text' : 'border-line2 text-muted'
                    }`}
                    aria-pressed={on}
                  >
                    {on && <Check size={13} strokeWidth={3} />}
                    {it.name}
                    {it.essential && !on && <span className="w-1.5 h-1.5 rounded-full bg-blue" aria-label="esencial" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
