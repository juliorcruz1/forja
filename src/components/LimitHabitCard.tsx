import { Pencil, Play, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { setBadHabitLifecycle, setUsage } from '../db/repo';
import type { BadHabit } from '../db/types';
import { limitOf, usageOn, usageTrend, withinStreak } from '../domain/social';
import { useData } from '../hooks/useData';
import { addDays, type DateKey, formatShort, WEEKDAY_LETTER, weekday } from '../lib/dates';
import { HabitIcon } from './icons';
import { Card } from './ui';

/** Usage bar: "20 / 60 min". */
export function UsageBar({ minutes, limit }: { minutes: number | undefined; limit: number }) {
  const m = minutes ?? 0;
  const over = m > limit;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[1.75rem] leading-none font-bold">
          {minutes === undefined ? '—' : m}
          <span className="text-[0.875rem] font-medium text-muted"> / {limit} min</span>
        </p>
        <span className={`text-[0.75rem] ${over ? 'text-muted' : 'text-violet-text'}`}>
          {minutes === undefined ? 'Sin anotar' : over ? `${m - limit} min de más` : 'Dentro del límite'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-line overflow-hidden mt-2">
        <div
          className={`h-full rounded-full ${over ? 'bg-line2' : 'bg-violet'}`}
          style={{ width: `${Math.min(100, (m / Math.max(1, limit)) * 100)}%`, transition: 'width 400ms ease' }}
        />
      </div>
    </div>
  );
}

/** Quick nightly entry: minutes from Screen Time for today or yesterday. */
export function UsageEntry({ bad, compact = false }: { bad: BadHabit; compact?: boolean }) {
  const { usageLogs, today } = useData()!;
  const [date, setDate] = useState<DateKey>(today);
  const current = usageOn(bad, usageLogs, date);
  const [value, setValue] = useState(current === undefined ? '' : String(current));
  const [saved, setSaved] = useState(false);
  useEffect(() => setValue(current === undefined ? '' : String(current)), [current, date]);

  const save = async () => {
    const n = value.trim() === '' ? null : Number(value);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return;
    await setUsage(bad.id, date, n);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className={compact ? '' : 'card2 p-3'}>
      {!compact && <p className="text-[0.75rem] text-muted mb-2">Anota los minutos del Tiempo en pantalla de tu iPhone</p>}
      <div className="flex gap-2 items-center">
        <div className="flex rounded-full border border-line2 p-0.5 shrink-0">
          {[today, addDays(today, -1)].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              className={`hit px-2.5 min-h-[36px] rounded-full text-[0.75rem] ${date === d ? 'bg-card2 text-ink' : 'text-muted'}`}
            >
              {d === today ? 'Hoy' : 'Ayer'}
            </button>
          ))}
        </div>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          className="field py-2 text-center min-w-0"
          placeholder="min"
          aria-label={`Minutos de ${bad.name}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="pill-primary px-4 shrink-0" onClick={save}>
          {saved ? 'Listo' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

/** Card for a limit-mode bad habit in Hábitos → Malos. */
export function LimitHabitCard({ bad }: { bad: BadHabit }) {
  const { usageLogs, today } = useData()!;
  const limit = limitOf(bad);
  const trend = usageTrend(bad, usageLogs, addDays(today, -13), today);
  const week = usageTrend(bad, usageLogs, addDays(today, -6), today);
  const month = usageTrend(bad, usageLogs, addDays(today, -29), today);
  const streak = withinStreak(bad, usageLogs, today);
  const max = Math.max(limit * 1.5, ...trend.days.map((d) => d.minutes ?? 0));

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-card2 border border-line2 text-muted flex items-center justify-center shrink-0">
            <HabitIcon name={bad.icon} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold truncate">{bad.name}</p>
            <p className="text-[0.75rem] text-muted">Límite diario: {limit} min</p>
          </div>
        </div>
        <Link to={`/malos/${bad.id}/editar`} className="icon-btn -mr-2 -mt-1" aria-label="Editar">
          <Pencil size={17} />
        </Link>
      </div>

      <div className="mt-4">
        <UsageBar minutes={usageOn(bad, usageLogs, today)} limit={limit} />
      </div>

      <div className="mt-4" aria-label="Últimos 14 días">
        <div className="relative flex items-end gap-[5px] h-[72px]">
          <div className="absolute inset-x-0 border-t border-dashed border-violet/50" style={{ bottom: `${(limit / max) * 100}%` }} />
          {trend.days.map((d) => (
            <div
              key={d.date}
              title={`${formatShort(d.date)}: ${d.minutes ?? 'sin anotar'}`}
              className={`flex-1 rounded-t ${d.minutes === null ? 'bg-[#121217]' : d.over ? 'bg-line2' : 'bg-violet'}`}
              style={{ height: d.minutes === null ? 4 : `${Math.max(4, ((d.minutes ?? 0) / max) * 100)}%` }}
            />
          ))}
        </div>
        <div className="flex gap-[5px] mt-1">
          {trend.days.map((d) => (
            <span key={d.date} className={`flex-1 text-center text-[0.5625rem] ${d.date === today ? 'text-ink' : 'text-dim'}`}>
              {WEEKDAY_LETTER[weekday(d.date)]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div className="card2 p-2">
          <p className="text-lg font-bold">{week.average ?? '—'}</p>
          <p className="text-[0.625rem] text-muted">Promedio 7 días</p>
        </div>
        <div className="card2 p-2">
          <p className="text-lg font-bold">{month.average ?? '—'}</p>
          <p className="text-[0.625rem] text-muted">Promedio 30 días</p>
        </div>
        <div className="card2 p-2">
          <p className="text-lg font-bold">{streak}</p>
          <p className="text-[0.625rem] text-muted">Días seguidos en límite</p>
        </div>
      </div>

      {bad.lifecycle === 'active' ? (
        <div className="mt-3">
          <UsageEntry bad={bad} />
          <p className="text-[0.6875rem] text-dim mt-2">
            FORJA no puede leer ni bloquear apps: el límite real lo pones en Ajustes del iPhone → Tiempo en pantalla.
            Aquí registras y ves tu tendencia.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-line">
          <span className="text-[0.75rem] text-muted">{bad.lifecycle === 'archived' ? 'Archivado' : 'En pausa'}</span>
          <button className="pill-ghost min-h-[40px] text-violet-text" onClick={() => setBadHabitLifecycle(bad.id, 'active')}>
            {bad.lifecycle === 'archived' ? <RotateCcw size={15} /> : <Play size={15} />}
            {bad.lifecycle === 'archived' ? 'Restaurar' : 'Reanudar'}
          </button>
        </div>
      )}
    </Card>
  );
}

