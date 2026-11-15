import { useState } from 'react';
import type { Habit, Weekday } from '../db/types';
import { setStatus, setWeekPlan } from '../db/repo';
import { type HabitIndex, isActiveOn, isDoneStatus, weeklyGoal } from '../domain/habits';
import { addDays, type DateKey, formatLong, WEEKDAY_LETTER, weekDays, weekStart } from '../lib/dates';
import { Sheet } from './ui';

/** L M X J V S D strip for a weekly-target habit: done, extra day, planned, today. */
export function WeekStrip({ habit, idx, today, ws = weekStart(today) }: { habit: Habit; idx: HabitIndex; today: DateKey; ws?: DateKey }) {
  const goal = weeklyGoal(habit, idx, today, ws);
  const [sel, setSel] = useState<DateKey | null>(null);
  const days = weekDays(ws);

  const togglePlan = (d: DateKey) => {
    const wd = days.indexOf(d) as Weekday;
    const set = new Set(goal.planned);
    if (set.has(wd)) set.delete(wd);
    else set.add(wd);
    setWeekPlan(habit.id, ws, [...set] as Weekday[]);
  };

  return (
    <>
      <div className="flex justify-between">
        {days.map((d, i) => {
          const done = isDoneStatus(idx.status(habit.id, d));
          const planned = goal.planned.includes(i as Weekday) && isActiveOn(habit, d);
          const isToday = d === today;
          let cls = 'border border-line2 text-dim';
          if (done && planned) cls = 'bg-violet text-white';
          else if (done) cls = 'bg-blue text-white';
          else if (planned) cls = 'border-2 border-dashed border-violet text-violet-text';
          return (
            <button
              key={d}
              onClick={() => setSel(d)}
              className="flex flex-col items-center gap-1.5 min-w-[44px]"
              aria-label={`${formatLong(d)}${done ? ', hecho' : planned ? ', planeado' : ''}`}
            >
              <span className={`text-[11px] font-medium ${isToday ? 'text-ink' : 'text-muted'}`}>{WEEKDAY_LETTER[i]}</span>
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold transition ${cls} ${
                  isToday ? 'ring-2 ring-offset-2 ring-offset-card ring-ink/80' : ''
                }`}
              >
                {Number(d.slice(8))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-violet" />Hecho</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full border border-dashed border-violet" />Planeado</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-blue" />Día extra</span>
      </div>

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? formatLong(sel) : ''}>
        {sel && (
          <div className="space-y-2">
            {sel <= today && (
              <>
                <button className="pill-primary w-full" onClick={() => { setStatus(habit.id, sel, isDoneStatus(idx.status(habit.id, sel)) ? 'pending' : 'done'); setSel(null); }}>
                  {isDoneStatus(idx.status(habit.id, sel)) ? 'Quitar como hecho' : 'Marcar como hecho'}
                </button>
                {habit.minVersion && !isDoneStatus(idx.status(habit.id, sel)) && (
                  <button className="pill-ghost w-full" onClick={() => { setStatus(habit.id, sel, 'min'); setSel(null); }}>
                    Hice el mínimo · {habit.minVersion}
                  </button>
                )}
              </>
            )}
            <button className="pill-ghost w-full" onClick={() => { togglePlan(sel); setSel(null); }}>
              {goal.planned.includes(days.indexOf(sel) as Weekday) ? 'Quitar de planeados' : 'Planear este día'}
            </button>
            <p className="text-[12px] text-muted text-center pt-1">
              Cambiar los días planeados solo afecta la semana del {formatLong(ws).split(', ')[1]} al {formatLong(addDays(ws, 6)).split(', ')[1]}.
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
