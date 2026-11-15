import { ChevronLeft, ChevronRight, Flame, Lightbulb, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HabitIcon } from '../components/icons';
import { Bar, Card, Empty, Screen, Segmented } from '../components/ui';
import { badHabitStats, relapsesInRange } from '../domain/bad';
import { bestOverallStreak, overallStreak } from '../domain/habits';
import { observation, type Period, type PeriodKind, periodFor, periodStats } from '../domain/stats';
import { useData } from '../hooks/useData';
import { formatPts, summarize } from '../domain/points';
import { isLimitHabit, limitOf, usageTrend } from '../domain/social';
import type { BadHabit } from '../db/types';
import { LevelBar } from '../components/PointsBits';
import { MONTH_NAMES, minKey, WEEKDAY_LETTER, weekday } from '../lib/dates';
import { addDays, addMonths, monthStart, weekStart } from '../lib/dates';

const PREV_LABEL: Record<PeriodKind, string> = { week: 'la semana anterior', month: 'el mes anterior', year: 'el año anterior' };

function shift(p: Period, n: number): Period {
  if (p.kind === 'week') return periodFor('week', addDays(p.from, 7 * n));
  if (p.kind === 'month') return periodFor('month', addMonths(p.from, n));
  return periodFor('year', `${Number(p.from.slice(0, 4)) + n}-06-01`);
}

export function StatsScreen() {
  const data = useData();
  const [kind, setKind] = useState<PeriodKind>('week');
  const [offset, setOffset] = useState(0);
  if (!data) return null;
  const { habits, idx, today, badHabits, relapses } = data;
  const period = shift(periodFor(kind, today), offset);
  const s = periodStats(habits, idx, period, today);
  const obs = observation(s);
  const delta = s.overall.pct !== null && s.previous.pct !== null ? s.overall.pct - s.previous.pct : null;
  const cur = overallStreak(habits, idx, today);
  const best = bestOverallStreak(habits, idx, today);
  // Archived bad habits keep their statistics (shown with a label)
  const activeBad = badHabits;
  const extrasTotal = s.extras.reduce((a, e) => a + e.days, 0) + s.oneOffDone;

  return (
    <Screen title="Estadísticas">
      <Segmented
        value={kind}
        options={[{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }, { value: 'year', label: 'Año' }]}
        onChange={(k) => { setKind(k); setOffset(0); }}
      />
      <div className="flex items-center justify-between -my-1">
        <button className="icon-btn" aria-label="Periodo anterior" onClick={() => setOffset(offset - 1)}><ChevronLeft size={20} /></button>
        <p className="text-sm font-medium capitalize">{period.label}</p>
        <button className="icon-btn disabled:opacity-25" aria-label="Periodo siguiente" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}>
          <ChevronRight size={20} />
        </button>
      </div>

      <Card>
        <p className="text-[13px] text-muted">Cumplimiento</p>
        <div className="flex items-end gap-3 mt-1">
          <p className="text-[48px] leading-none font-bold tracking-tight">{s.overall.pct === null ? '—' : `${s.overall.pct}%`}</p>
        </div>
        <p className={`text-[13px] mt-2 ${delta !== null && delta >= 0 ? 'text-violet-text' : 'text-muted'}`}>
          {delta !== null
            ? `${delta >= 0 ? '+' : ''}${delta} pts vs ${PREV_LABEL[kind]} (${s.previous.pct}%)`
            : `Sin registros en ${PREV_LABEL[kind]} para comparar`}
        </p>
        <p className="text-[12px] text-dim mt-1">
          {s.overall.done} de {s.overall.slots} cumplidos{extrasTotal > 0 ? ` · +${extrasTotal} extras` : ''}
        </p>
        <BarChart buckets={s.buckets} />
      </Card>

      <div className="grid grid-cols-2 gap-3.5">
        <Card>
          <Flame size={18} className="text-violet-text" />
          <p className="text-3xl font-bold mt-2">{cur}</p>
          <p className="text-[12px] text-muted">Racha actual (días)</p>
        </Card>
        <Card>
          <Trophy size={18} className="text-blue-text" />
          <p className="text-3xl font-bold mt-2">{best}</p>
          <p className="text-[12px] text-muted">Mejor racha (días)</p>
        </Card>
      </div>

      <PointsCard period={period} />

      <div className="rounded-card border p-4 flex gap-3" style={{ background: '#1A1530', borderColor: '#3A2F66' }}>
        <Lightbulb size={20} className="text-night-text shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-night-text">Observación</p>
          <p className="text-[14px] text-night-text/90 mt-0.5">
            {obs ?? 'Todavía no hay registros en este periodo. Marca tus hábitos y aquí aparecerá un análisis de tus datos.'}
          </p>
        </div>
      </div>

      <Card>
        <p className="font-semibold mb-3">Por hábito</p>
        {s.perHabit.length === 0 ? (
          <Empty>Sin datos en este periodo.</Empty>
        ) : (
          <div className="space-y-3.5">
            {[...s.perHabit].sort((a, b) => (b.tally.pct ?? -1) - (a.tally.pct ?? -1)).map(({ habit, tally }) => (
              <div key={habit.id}>
                <div className="flex items-center justify-between text-[14px] mb-1.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <HabitIcon name={habit.icon} size={15} className="text-muted" />
                    <span className="truncate">{habit.name}</span>
                    {habit.lifecycle === 'archived' && <span className="text-[11px] text-dim shrink-0">Archivado</span>}
                  </span>
                  <span className="text-muted shrink-0">
                    {tally.pct === null ? '—' : `${tally.pct}%`}
                    <span className="text-dim text-[12px]"> · {tally.done}/{tally.slots}</span>
                  </span>
                </div>
                <Bar pct={tally.pct ?? 0} />
              </div>
            ))}
          </div>
        )}
        {(s.extras.length > 0 || s.oneOffDone > 0) && (
          <div className="mt-4 pt-3 border-t border-line space-y-1.5">
            {s.extras.map((e) => (
              <div key={e.habit.id} className="flex items-center justify-between text-[13px]">
                <span className="text-blue-text">{e.habit.name} (extra)</span>
                <span className="text-muted">{e.days} {e.days === 1 ? 'día' : 'días'}</span>
              </div>
            ))}
            {s.oneOffDone > 0 && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-blue-text">Solo para hoy (extra)</span>
                <span className="text-muted">{s.oneOffDone} {s.oneOffDone === 1 ? 'hecho' : 'hechos'}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {activeBad.length === 0 && (
        <Card>
          <p className="font-semibold mb-1">Hábitos malos</p>
          <p className="text-[13px] text-muted">
            Aquí verás días sin caer, mejor marca y recaídas por semana y mes.{' '}
            <Link to="/malos/nuevo" className="text-violet-text">Agregar uno</Link>
          </p>
        </Card>
      )}
      {activeBad.length > 0 && (
        <Card>
          <p className="font-semibold mb-3">Hábitos malos</p>
          <div className="space-y-3">
            {activeBad.map((b) => {
              if (isLimitHabit(b)) return <UsageStats key={b.id} bad={b} period={period} />;
              const st = badHabitStats(b, relapses, today);
              const ws = weekStart(today);
              const ms = monthStart(today);
              return (
                <div key={b.id} className="card2 p-3">
                  <p className="text-[14px] font-medium flex items-center gap-2">
                    <HabitIcon name={b.icon} size={15} className="text-muted" /> {b.name}
                    {b.lifecycle !== 'active' && (
                      <span className="text-[11px] text-dim">{b.lifecycle === 'archived' ? 'Archivado' : 'En pausa'}</span>
                    )}
                  </p>
                  <div className="grid grid-cols-4 gap-2 mt-2 text-center">
                    <MiniStat label="Días sin" value={st.current} />
                    <MiniStat label="Mejor" value={st.best} />
                    <MiniStat label="Rec. semana" value={relapsesInRange(b, relapses, ws, addDays(ws, 6))} />
                    <MiniStat label="Rec. mes" value={relapsesInRange(b, relapses, ms, addDays(addMonths(ms, 1), -1))} />
                  </div>
                  <p className="text-[11px] text-dim mt-2">En este periodo: {relapsesInRange(b, relapses, period.from, period.to)} recaídas</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </Screen>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted leading-tight">{label}</p>
    </div>
  );
}

function BarChart({ buckets }: { buckets: { label: string; pct: number | null; from: string }[] }) {
  return (
    <div className="flex items-end gap-1.5 h-[120px] mt-4" role="img" aria-label="Cumplimiento por periodo">
      {buckets.map((b) => (
        <div key={b.from} className="flex-1 flex flex-col items-center gap-1.5 h-full">
          <div className="flex-1 w-full flex items-end">
            <div
              className={`w-full rounded-md ${b.pct === null ? 'bg-line' : b.pct >= 100 ? 'bg-violet' : 'bg-gradient-to-t from-violet/70 to-blue/80'}`}
              style={{ height: b.pct === null ? 4 : `${Math.max(4, b.pct)}%`, transition: 'height 500ms ease' }}
              title={b.pct === null ? 'sin datos' : `${b.pct}%`}
            />
          </div>
          <span className="text-[10px] text-dim">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Points of the selected period: net, gains, losses, chart per day (per month for a year) and breakdown. */
function PointsCard({ period }: { period: Period }) {
  const { points, today, settings } = useData()!;
  const to = minKey(period.to, today);
  const sum = summarize(points, period.from, to);
  const bars =
    period.kind === 'year'
      ? MONTH_NAMES.map((m, i) => {
          const from = addMonths(period.from, i);
          const end = addDays(addMonths(from, 1), -1);
          return { key: m, label: m.slice(0, 1).toUpperCase(), net: sum.perDay.filter((d) => d.date >= from && d.date <= end).reduce((a, d) => a + d.net, 0) };
        })
      : sum.perDay.map((d) => ({
          key: d.date,
          label: period.kind === 'week' ? WEEKDAY_LETTER[weekday(d.date)] : Number(d.date.slice(8)) % 5 === 1 ? String(Number(d.date.slice(8))) : '',
          net: d.net,
        }));
  const maxAbs = Math.max(1, ...bars.map((b) => Math.abs(b.net)));
  const hasNeg = bars.some((b) => b.net < 0);
  const gains = sum.byKind.filter((k) => k.pts > 0);
  const losses = sum.byKind.filter((k) => k.pts < 0);

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">Puntos</p>
        <Link to="/puntos" className="text-[13px] text-violet-text min-h-[32px] inline-flex items-center">Detalle</Link>
      </div>
      {period.to < settings.pointsStartDate ? (
        <p className="text-sm text-muted mt-2">Los puntos cuentan desde el {settings.pointsStartDate}.</p>
      ) : (
        <>
          <div className="flex items-end gap-4 mt-1">
            <p className="text-[40px] leading-none font-bold tracking-tight">{sum.net >= 0 ? '+' : ''}{formatPts(sum.net)}</p>
            <p className="text-[13px] text-muted mb-1">+{formatPts(sum.gain)} ganados · −{formatPts(sum.loss)} restados</p>
          </div>
          <div className="flex items-stretch gap-[3px] h-[110px] mt-4" role="img" aria-label="Puntos por día">
            {bars.map((b) => (
              <div key={b.key} className="flex-1 flex flex-col min-w-0">
                <div className={`flex-1 flex flex-col ${hasNeg ? '' : 'justify-end'}`}>
                  <div className={`${hasNeg ? 'h-1/2' : 'h-full'} flex items-end`}>
                    {b.net > 0 && <div className="w-full rounded-t bg-violet" style={{ height: `${(b.net / maxAbs) * 100}%` }} title={`+${b.net}`} />}
                  </div>
                  {hasNeg && (
                    <div className="h-1/2 flex items-start border-t border-line">
                      {b.net < 0 && <div className="w-full rounded-b bg-line2" style={{ height: `${(-b.net / maxAbs) * 100}%` }} title={`${b.net}`} />}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-dim text-center h-4 mt-1">{b.label}</span>
              </div>
            ))}
          </div>
          {(gains.length > 0 || losses.length > 0) && (
            <div className="grid grid-cols-1 gap-3 mt-4 pt-3 border-t border-line">
              {gains.length > 0 && (
                <ul className="space-y-1 text-[13px]">
                  <li className="text-[12px] font-semibold text-muted">Cómo los ganaste</li>
                  {gains.map((k) => (
                    <li key={k.kind} className="flex justify-between"><span className="text-muted">{k.label}</span><span className="text-violet-text">+{formatPts(k.pts)}</span></li>
                  ))}
                </ul>
              )}
              {losses.length > 0 && (
                <ul className="space-y-1 text-[13px]">
                  <li className="text-[12px] font-semibold text-muted">Restas</li>
                  {losses.map((k) => (
                    <li key={k.kind} className="flex justify-between"><span className="text-muted">{k.label}</span><span>−{formatPts(-k.pts)}</span></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-line">
            <LevelBar level={points.level} maxTotal={points.maxTotal} />
          </div>
        </>
      )}
    </Card>
  );
}

/** Limit-mode habit (Redes / scroll): usage over the selected period, by day (week/month) or month (year). */
function UsageStats({ bad, period }: { bad: BadHabit; period: Period }) {
  const { usageLogs, today } = useData()!;
  const to = minKey(period.to, today);
  const t = usageTrend(bad, usageLogs, period.from, to < period.from ? period.from : to);
  const limit = limitOf(bad);
  const bars =
    period.kind === 'year'
      ? MONTH_NAMES.map((m, i) => {
          const from = addMonths(period.from, i);
          const end = addDays(addMonths(from, 1), -1);
          const vals = t.days.filter((d) => d.date >= from && d.date <= end && d.minutes !== null).map((d) => d.minutes as number);
          return { key: m, label: m.slice(0, 1).toUpperCase(), v: vals.length ? Math.round(vals.reduce((a, n) => a + n, 0) / vals.length) : null };
        })
      : t.days.map((d) => ({
          key: d.date,
          label: period.kind === 'week' ? WEEKDAY_LETTER[weekday(d.date)] : Number(d.date.slice(8)) % 5 === 1 ? String(Number(d.date.slice(8))) : '',
          v: d.minutes,
        }));
  const max = Math.max(limit * 1.5, ...bars.map((b) => b.v ?? 0));
  return (
    <div className="card2 p-3">
      <p className="text-[14px] font-medium flex items-center gap-2">
        <HabitIcon name={bad.icon} size={15} className="text-muted" /> {bad.name}
        <span className="text-[11px] text-dim">límite {limit} min</span>
      </p>
      <div className="grid grid-cols-3 gap-2 mt-2 text-center">
        <MiniStat label="Promedio (min)" value={t.average ?? 0} />
        <MiniStat label="Días en límite" value={t.daysWithin} />
        <MiniStat label="Días pasado" value={t.daysOver} />
      </div>
      <div className="relative flex items-end gap-[3px] h-[64px] mt-3" role="img" aria-label="Minutos por día">
        <div className="absolute inset-x-0 border-t border-dashed border-violet/50" style={{ bottom: `${(limit / max) * 100}%` }} />
        {bars.map((b) => (
          <div key={b.key} className="flex-1 flex flex-col justify-end h-full">
            <div
              className={`rounded-t ${b.v === null ? 'bg-[#121217]' : b.v > limit ? 'bg-line2' : 'bg-violet'}`}
              style={{ height: b.v === null ? 3 : `${Math.max(4, (b.v / max) * 100)}%` }}
              title={b.v === null ? 'sin anotar' : `${b.v} min`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1">
        {bars.map((b) => <span key={b.key} className="flex-1 text-center text-[9px] text-dim">{b.label}</span>)}
      </div>
      {t.logged === 0 && <p className="text-[11px] text-dim mt-2">Sin minutos anotados en este periodo.</p>}
    </div>
  );
}
