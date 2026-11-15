import type { Habit } from '../db/types';
import { evalDay, type HabitIndex, isActiveOn } from '../domain/habits';
import { type DateKey, monthDays, WEEKDAY_LETTER, weekday } from '../lib/dates';

/** Month calendar for one habit: done violet, minimum blue, past-not-done dark gray, future darker, today ringed. */
export function MonthGrid({
  habit, idx, today, month, onDay, compact = false,
}: { habit: Habit; idx: HabitIndex; today: DateKey; month: DateKey; onDay?: (d: DateKey) => void; compact?: boolean }) {
  const days = monthDays(month);
  const lead = weekday(days[0]);
  const size = compact ? 'w-[13px] h-[13px] rounded-[4px]' : 'aspect-square rounded-full text-[0.75rem]';
  return (
    <div>
      {!compact && (
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {WEEKDAY_LETTER.map((l) => (
            <span key={l} className="text-center text-[0.6875rem] text-dim">{l}</span>
          ))}
        </div>
      )}
      <div className={`grid grid-cols-7 ${compact ? 'gap-[3px] w-max' : 'gap-1.5'}`}>
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {days.map((d) => {
          const st = idx.status(habit.id, d);
          const active = isActiveOn(habit, d);
          let cls = 'bg-[#121217] text-dim'; // future / inactive
          if (d <= today && active) {
            const e = evalDay(habit, d, idx, today);
            if (st === 'done') cls = 'bg-violet text-white';
            else if (st === 'min') cls = 'bg-blue text-white';
            else if (st === 'rest') cls = 'bg-card2 text-dim';
            else if (e.counts || habit.frequency.type === 'weekly') cls = 'bg-line2 text-muted';
            else cls = 'bg-card2 text-dim';
          }
          const ring = d === today ? 'ring-2 ring-ink/80 ring-offset-1 ring-offset-card' : '';
          return (
            <button
              key={d}
              type="button"
              disabled={!onDay || d > today}
              onClick={() => onDay?.(d)}
              className={`${compact ? '' : 'hit'} ${size} ${cls} ${ring} flex items-center justify-center font-medium`}
              aria-label={d}
            >
              {compact ? '' : Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
