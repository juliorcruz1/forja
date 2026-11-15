import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarLegend, DayMarks, DayShape, KIND_LABEL } from '../components/CalendarBits';
import { DayStatusSheet } from '../components/DayStatusSheet';
import { HabitIcon } from '../components/icons';
import { Card, Screen, Segmented } from '../components/ui';
import type { Habit, LogStatus } from '../db/types';
import { type CalendarInput, dayInfo, monthInfo, weekInfo, yearInfo } from '../domain/calendar';
import { habitsForDay, isScheduledByFrequency, weeklyGoal } from '../domain/habits';
import { PUNISH_LABEL } from '../domain/punish';
import { useData } from '../hooks/useData';
import {
  addDays, addMonths, type DateKey, formatLong, formatMonth, formatShort, formatTime, isValidKey, MONTH_NAMES, monthStart,
  WEEKDAY_LETTER, WEEKDAY_NAMES, weekStart,
} from '../lib/dates';

export type CalView = 'dia' | 'semana' | 'mes' | 'anio';
const VIEWS: { value: CalView; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'anio', label: 'Año' },
];

export const STATUS_LABEL: Record<LogStatus, string> = {
  done: 'Completo', min: 'Mínimo', pending: 'Pendiente', skipped: 'Saltado', rest: 'Descanso',
};

/** Calendar: Día / Semana / Mes / Año. State lives in the URL: ?v=mes&d=YYYY-MM-DD */
export function CalendarScreen() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const input = useMemo<CalendarInput | null>(
    () =>
      data ? {
        habits: data.habits, idx: data.idx, today: data.today, settings: data.settings, dayMeta: data.dayMeta,
        jokers: data.jokers, relapses: data.relapses, badHabits: data.badHabits, debts: data.debts,
      } : null,
    [data],
  );
  if (!data || !input) return null;
  const { today } = data;
  const v = (VIEWS.some((x) => x.value === params.get('v')) ? params.get('v') : 'mes') as CalView;
  const qd = params.get('d');
  const date = qd && isValidKey(qd) ? qd : today;
  const go = (next: { v?: CalView; d?: DateKey }) =>
    setParams({ v: next.v ?? v, d: next.d ?? date }, { replace: true });
  const step = (n: number) =>
    go({
      d: v === 'mes' ? addMonths(monthStart(date), n) : v === 'anio' ? addMonths(monthStart(date), 12 * n) : addDays(date, v === 'semana' ? 7 * n : n),
    });
  const ws = weekStart(date);
  const label =
    v === 'mes' ? formatMonth(date) : v === 'anio' ? date.slice(0, 4) : v === 'semana' ? `${formatShort(ws)} – ${formatShort(addDays(ws, 6))}` : formatLong(date);
  const atToday =
    v === 'mes' ? monthStart(date) === monthStart(today)
      : v === 'anio' ? date.slice(0, 4) === today.slice(0, 4)
        : v === 'semana' ? ws === weekStart(today) : date === today;

  return (
    <Screen title="Calendario" back>
      <Segmented value={v} options={VIEWS} onChange={(nv) => go({ v: nv })} />
      <div className="flex items-center gap-1">
        <button className="icon-btn -ml-2" aria-label="Anterior" onClick={() => step(-1)}>
          <ChevronLeft size={22} />
        </button>
        <p className="flex-1 text-center font-semibold" aria-live="polite">{label}</p>
        <button className="icon-btn" aria-label="Siguiente" onClick={() => step(1)}>
          <ChevronRight size={22} />
        </button>
        <button className="pill-ghost px-4 min-h-[44px] disabled:opacity-40" disabled={atToday} onClick={() => go({ d: today })}>
          Hoy
        </button>
      </div>

      {v === 'mes' && <MonthView month={date} input={input} onDay={(d) => go({ v: 'dia', d })} />}
      {v === 'dia' && <DayView date={date} input={input} />}
      {v === 'semana' && <WeekView ws={ws} input={input} onDay={(d) => go({ v: 'dia', d })} />}
      {v === 'anio' && <YearView date={date} input={input} onMonth={(d) => go({ v: 'mes', d })} />}
    </Screen>
  );
}

function MonthView({ month, input, onDay }: { month: DateKey; input: CalendarInput; onDay: (d: DateKey) => void }) {
  const m = useMemo(() => monthInfo(month, input), [month, input]);
  const weekly = input.habits.find((h) => h.frequency.type === 'weekly' && !h.oneOffDate && h.lifecycle !== 'archived');
  const s = m.summary;
  return (
    <>
      <Card>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LETTER.map((l) => (
            <span key={l} className="text-center text-[0.6875rem] text-dim">{l}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1.5 gap-x-1">
          {Array.from({ length: m.lead }, (_, i) => <span key={`l${i}`} />)}
          {m.days.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => onDay(d.date)}
              className="hit flex flex-col items-center gap-1 py-1 min-h-[44px] rounded-xl active:bg-card2"
              aria-label={`${formatLong(d.date)}: ${KIND_LABEL[d.kind]}${d.weekly.length ? `, ${d.weekly.map((w) => `${w.name} ${w.done ? 'hecho' : 'planeado'}`).join(', ')}` : ''}`}
            >
              <DayShape kind={d.kind} today={d.isToday} className="w-8 h-8 text-[0.8125rem]">
                {Number(d.date.slice(8))}
              </DayShape>
              <DayMarks day={d} />
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat n={s.perfect} label="Perfectos" />
          <Stat n={s.partial} label="Parciales" />
          <Stat n={s.missed} label="Sin cumplir" />
          <Stat n={s.rest} label="Descanso" />
        </div>
        {weekly && s.planned + s.unplannedDone > 0 && (
          <p className="text-[0.8125rem] text-muted mt-3">
            {s.planned > 0
              ? `${weekly.name}: ${s.plannedDone} de ${s.planned} días planeados${s.unplannedDone > 0 ? ` · ${s.unplannedDone} fuera de plan` : ''}.`
              : `${weekly.name}: ${s.unplannedDone} ${s.unplannedDone === 1 ? 'día hecho' : 'días hechos'} (sin días planeados).`}
          </p>
        )}
      </Card>
      <div className="px-1">
        <CalendarLegend weeklyName={weekly?.name} />
        <p className="text-[0.75rem] text-dim mt-2">Toca un día para ver el detalle.</p>
      </div>
    </>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="text-xl font-bold">{n}</p>
      <p className="text-[0.6875rem] text-muted leading-tight">{label}</p>
    </div>
  );
}

export function DayView({ date, input }: { date: DateKey; input: CalendarInput }) {
  const data = useData()!;
  const d = useMemo(() => dayInfo(date, input), [date, input]);
  const { required, extras, oneOff } = habitsForDay(input.habits, date);
  const pts = date >= data.settings.pointsStartDate ? data.points.byDate.get(date) : undefined;
  const relapses = data.relapses.filter((r) => r.date === date);
  const badName = (id: string) => data.badHabits.find((b) => b.id === id)?.name ?? 'Hábito malo';
  const future = date > input.today;
  const [editing, setEditing] = useState<Habit | null>(null);

  const row = (h: (typeof required)[number], tag?: string) => {
    const scheduled = h.frequency.type === 'weekly' || isScheduledByFrequency(h, date) || !!h.oneOffDate;
    const st = input.idx.status(h.id, date);
    const mark = d.weekly.find((w) => w.habitId === h.id);
    const text = !scheduled && st === 'pending' ? 'No tocaba' : future && st === 'pending' ? (mark?.planned ? 'Planeado' : '—') : STATUS_LABEL[st];
    return (
      <li key={h.id}>
        <button
          type="button"
          disabled={future}
          onClick={() => setEditing(h)}
          className="w-full text-left flex items-center gap-3 px-4 py-2.5 min-h-[52px] active:bg-card2"
          aria-label={`${h.name}: ${text}${future ? '' : '. Toca para corregir'}`}
        >
        <span className="w-8 h-8 rounded-xl bg-card2 flex items-center justify-center text-muted shrink-0">
          <HabitIcon name={h.icon} size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[0.9375rem] truncate">{h.name}</p>
          {(tag || mark?.planned) && (
            <p className="text-[0.75rem] text-muted">{[tag, mark?.planned ? 'Planeado para este día' : null].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <span className={`text-[0.8125rem] shrink-0 ${st === 'done' ? 'text-violet-text' : st === 'min' ? 'text-blue-text' : 'text-muted'}`}>{text}</span>
          {!future && <Pencil size={14} className="text-dim shrink-0" />}
        </button>
      </li>
    );
  };

  return (
    <>
      <Card>
        <div className="flex items-center gap-3">
          <DayShape kind={d.kind} today={d.isToday} className="w-11 h-11 text-[0.9375rem] shrink-0">
            {Number(date.slice(8))}
          </DayShape>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{KIND_LABEL[d.kind]}</p>
            <p className="text-[0.8125rem] text-muted">
              {d.total > 0 ? `${d.done} de ${d.total} obligatorios · ${d.pct}%` : future ? 'Todavía no llega' : 'Nada obligatorio contó este día'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3 text-[0.75rem]">
          <span className="card2 px-2.5 py-1 text-muted">
            {d.work ? `Trabajo ${formatTime(d.work.start)} – ${formatTime(d.work.end)}` : 'Día libre de trabajo'}
          </span>
          {d.joker && <span className="card2 px-2.5 py-1 text-blue-text">Comodín usado</span>}
          {d.heavy && <span className="card2 px-2.5 py-1 text-blue-text">Día pesado</span>}
          {pts && !future && (
            <span className="card2 px-2.5 py-1 text-violet-text">
              {pts.net >= 0 ? '+' : ''}{pts.net} pts{pts.provisional ? ' (en curso)' : ''}
            </span>
          )}
        </div>
      </Card>

      {required.length + extras.length + oneOff.length > 0 && (
        <ul className="card divide-y divide-line">
          {required.map((h) => row(h))}
          {extras.map((h) => row(h, 'Opcional'))}
          {oneOff.map((h) => row(h, 'Solo ese día'))}
        </ul>
      )}

      {relapses.length > 0 && (
        <Card>
          <p className="text-[0.8125rem] font-semibold text-muted mb-1">Hábitos malos</p>
          {relapses.map((r) => (
            <p key={r.id} className="text-[0.875rem]">Recaída: {badName(r.badHabitId)}{r.note ? ` · ${r.note}` : ''}</p>
          ))}
        </Card>
      )}

      {d.debt && (
        <Card>
          <p className="text-[0.8125rem] font-semibold text-muted mb-1">Castigo de este día</p>
          <p className="text-[0.875rem]">{d.debt.detail || d.debt.label}</p>
          <p className="text-[0.75rem] text-muted">
            {PUNISH_LABEL[d.debt.type]} · {d.debt.status === 'pending' ? 'pendiente' : d.debt.status === 'paid' ? 'pagada' : d.debt.status === 'reset' ? 'reiniciada' : 'al frasco'}
          </p>
        </Card>
      )}

      {!future && (
        <p className="text-[0.75rem] text-dim px-1">
          Toca un hábito para corregir ese día. Rachas, puntos, castigos y medallas se recalculan solos.
        </p>
      )}
      {!future && date !== input.today && (
        <Link to={`/hoy?d=${date}`} className="pill-ghost w-full">Abrir este día en Inicio</Link>
      )}
      {editing && <DayStatusSheet habit={editing} date={date} idx={data.idx} onClose={() => setEditing(null)} />}
    </>
  );
}

function WeekView({ ws, input, onDay }: { ws: DateKey; input: CalendarInput; onDay: (d: DateKey) => void }) {
  const w = useMemo(() => weekInfo(ws, input), [ws, input]);
  const end = addDays(ws, 6);
  const weekly = input.habits.filter(
    (h) => h.frequency.type === 'weekly' && h.required && !h.oneOffDate && h.startDate <= end && (!h.archivedAt || h.archivedAt > ws),
  );
  const s = w.summary;
  return (
    <>
      <ul className="card divide-y divide-line">
        {w.days.map((d, i) => (
          <li key={d.date}>
            <button
              type="button"
              onClick={() => onDay(d.date)}
              className="w-full text-left flex items-center gap-3 px-4 py-2.5 min-h-[60px] active:bg-card2"
              aria-label={`${formatLong(d.date)}: ${KIND_LABEL[d.kind]}`}
            >
              <DayShape kind={d.kind} today={d.isToday} className="w-9 h-9 text-[0.8125rem] shrink-0">
                {Number(d.date.slice(8))}
              </DayShape>
              <div className="flex-1 min-w-0">
                <p className="text-[0.9375rem] capitalize">{WEEKDAY_NAMES[i]}</p>
                <p className="text-[0.75rem] text-muted truncate">
                  {[
                    d.work ? `Trabajo ${formatTime(d.work.start)}` : 'Libre',
                    ...d.weekly.map((m) => `${m.name} ${m.done ? 'hecho' : 'planeado'}`),
                    d.joker ? 'Comodín' : null,
                    d.heavy ? 'Día pesado' : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="text-[0.8125rem] text-muted shrink-0">
                {d.kind === 'future' ? '' : d.total ? `${d.done}/${d.total}` : d.kind === 'rest' ? 'Descanso' : '—'}
              </span>
              <ChevronRight size={16} className="text-dim shrink-0" />
            </button>
          </li>
        ))}
      </ul>
      <Card>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat n={s.perfect} label="Perfectos" />
          <Stat n={s.partial} label="Parciales" />
          <Stat n={s.missed} label="Sin cumplir" />
          <Stat n={s.rest} label="Descanso" />
        </div>
        {weekly.map((h) => {
          const g = weeklyGoal(h, input.idx, input.today, ws);
          return g.target > 0 ? (
            <p key={h.id} className="text-[0.8125rem] text-muted mt-3">
              {h.name}: {g.count} de {g.target}
              {g.planned.length ? ` · planeado ${g.planned.map((p) => WEEKDAY_LETTER[p]).join(' ')}` : ''}
              {g.state === 'met' ? ' · meta cumplida' : ''}
            </p>
          ) : null;
        })}
      </Card>
      <div className="px-1">
        <CalendarLegend weeklyName={weekly[0]?.name} />
        <p className="text-[0.75rem] text-dim mt-2">Toca un día para verlo o corregirlo.</p>
      </div>
    </>
  );
}

/** Year mini-calendar: same shape language at a small size (circle = cumplido/parcial, square = sin cumplir). */
const YEAR_SHAPE: Record<string, string> = {
  perfect: 'bg-violet rounded-full',
  partial: 'bg-blue-soft border border-blue rounded-full',
  open: 'border border-dashed border-violet rounded-full',
  missed: 'bg-dim/70 rounded-[2px]',
  rest: 'border border-dashed border-dim rounded-full',
  empty: 'bg-card2 rounded-[2px]',
  future: 'bg-card2/50 rounded-[2px]',
};

function YearView({ date, input, onMonth }: { date: DateKey; input: CalendarInput; onMonth: (d: DateKey) => void }) {
  const year = date.slice(0, 4);
  const y = useMemo(() => yearInfo(`${year}-01-01`, input), [year, input]);
  const s = y.summary;
  return (
    <>
      <Card>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat n={s.perfect} label="Perfectos" />
          <Stat n={s.partial} label="Parciales" />
          <Stat n={s.missed} label="Sin cumplir" />
          <Stat n={s.rest} label="Descanso" />
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        {y.months.map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onMonth(m.days[0].date)}
            className="card p-3 text-left active:scale-[0.99] transition"
            aria-label={`${MONTH_NAMES[i]}: ${m.summary.perfect} días perfectos`}
          >
            <span className="text-[0.8125rem] font-semibold capitalize mb-2 flex justify-between">
              {MONTH_NAMES[i]}
              {m.summary.perfect > 0 && <span className="text-violet-text font-normal">{m.summary.perfect}</span>}
            </span>
            <span className="grid grid-cols-7 gap-[3px]">
              {Array.from({ length: m.lead }, (_, k) => <span key={`l${k}`} />)}
              {m.days.map((d) => (
                <span key={d.date} className={`aspect-square ${YEAR_SHAPE[d.kind]} ${d.isToday ? 'ring-1 ring-ink' : ''}`} />
              ))}
            </span>
          </button>
        ))}
      </div>
      <div className="px-1">
        <CalendarLegend />
        <p className="text-[0.75rem] text-dim mt-2">Toca un mes para abrirlo.</p>
      </div>
    </>
  );
}
