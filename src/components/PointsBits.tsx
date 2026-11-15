import { Flame, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { removeJoker, applyJoker } from '../db/repo';
import type { DayPoints, LevelInfo } from '../domain/points';
import { formatPts } from '../domain/points';
import { useData } from '../hooks/useData';
import { type DateKey, formatLong, weekStart } from '../lib/dates';

/** "Hierro · 1.240 pts" — opens the points screen. */
export function LevelChip({ level, total }: { level: LevelInfo; total: number }) {
  return (
    <Link
      to="/puntos"
      className="hit inline-flex items-center gap-1.5 rounded-full border border-violet/50 bg-violet-soft px-3 min-h-[34px] text-[0.75rem] font-semibold text-violet-text whitespace-nowrap"
      aria-label={`Nivel ${level.name}, ${formatPts(total)} puntos`}
    >
      <Flame size={13} /> {level.name} · {formatPts(total)} pts
    </Link>
  );
}

/** "+26 pts hoy" (provisional today; real net for closed days). */
export function DayPointsChip({ day, isToday }: { day?: DayPoints; isToday: boolean }) {
  const net = day?.net ?? 0;
  const label = isToday ? `${net >= 0 ? '+' : ''}${net} pts hoy` : `${net >= 0 ? '+' : ''}${net} pts`;
  return (
    <Link
      to="/puntos"
      className={`hit inline-flex items-center rounded-full px-2.5 min-h-[28px] text-[0.75rem] font-semibold ${
        net >= 0 ? 'bg-blue-soft text-blue-text' : 'bg-card2 text-muted'
      }`}
      title={isToday ? 'Provisional: las restas se aplican al cerrar el día' : undefined}
    >
      {label}
    </Link>
  );
}

/** Progress bar toward the next level. */
export function LevelBar({ level, maxTotal }: { level: LevelInfo; maxTotal: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[0.75rem] mb-1.5">
        <span className="font-semibold text-violet-text">{level.name}</span>
        <span className="text-muted">
          {level.next ? `${formatPts(level.toNext)} pts para ${level.next.name}` : 'Nivel máximo'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={Math.round(level.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-violet to-blue" style={{ width: `${level.progress * 100}%`, transition: 'width 600ms ease' }} />
      </div>
      <p className="text-[0.6875rem] text-dim mt-1.5">Mejor marca: {formatPts(maxTotal)} pts · el nivel nunca baja</p>
    </div>
  );
}

/** Weekly joker ("comodín"): one per week, forgives the penalties of one day. */
export function JokerRow({ date }: { date: DateKey }) {
  const { jokers, today, settings } = useData()!;
  const ws = weekStart(date);
  const used = jokers.find((j) => j.weekStart === ws);
  if (date < settings.pointsStartDate) return null;
  return (
    <div className="card2 px-3.5 py-2.5 flex items-center gap-3 text-[0.8125rem]">
      <Ticket size={17} className="text-blue-text shrink-0" />
      <span className="flex-1 min-w-0">
        {!used && <>Comodín de la semana disponible</>}
        {used && used.date === date && <>Comodín usado en este día: sin restas</>}
        {used && used.date !== date && (
          <span className="text-muted">Comodín usado el {formatLong(used.date).toLowerCase()}</span>
        )}
      </span>
      {!used && date <= today && (
        <button className="chip-off text-[0.75rem]" onClick={() => applyJoker(date)}>
          Usar {date === today ? 'hoy' : 'aquí'}
        </button>
      )}
      {used && used.date === date && (
        <button className="chip-off text-[0.75rem]" onClick={() => removeJoker(date)}>
          Quitar
        </button>
      )}
    </div>
  );
}
