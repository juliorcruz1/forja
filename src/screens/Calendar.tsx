import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarLegend, DayMarks, DayShape, KIND_LABEL } from '../components/CalendarBits';
import { HabitIcon } from '../components/icons';
import { Card, Screen, Segmented } from '../components/ui';
import type { LogStatus } from '../db/types';
import { type CalendarInput, dayInfo, monthInfo } from '../domain/calendar';
import { habitsForDay, isScheduledByFrequency } from '../domain/habits';
import { PUNISH_LABEL } from '../domain/punish';
import { useData } from '../hooks/useData';
import {
  addDays, addMonths, type DateKey, formatLong, formatMonth, formatTime, isValidKey, monthStart, WEEKDAY_LETTER,
} from '../lib/dates';

export type CalView = 'dia' | 'mes';
const VIEWS: { value: CalView; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'mes', label: 'Mes' },
];

export const STATUS_LABEL: Record<LogStatus, string> = {
  done: 'Completo', min: 'Mínimo', pending: 'Pendiente', skipped: 'Saltado', rest: 'Descanso',
};

/** Calendar: Día / Mes (Semana and Año come next). State lives in the URL: ?v=mes&d=YYYY-MM-DD */
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
  const step = (n: number) => go({ d: v === 'mes' ? addMonths(monthStart(date), n) : addDays(date, n) });
  const label = v === 'mes' ? formatMonth(date) : formatLong(date);
  const atToday = v === 'mes' ? monthStart(date) === monthStart(today) : date === today;

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
              className="flex flex-col items-center gap-1 py-1 min-h-[44px] rounded-xl active:bg-card2"
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

  const row = (h: (typeof required)[number], tag?: string) => {
    const scheduled = h.frequency.type === 'weekly' || isScheduledByFrequency(h, date) || !!h.oneOffDate;
    const st = input.idx.status(h.id, date);
    const mark = d.weekly.find((w) => w.habitId === h.id);
    const text = !scheduled && st === 'pending' ? 'No tocaba' : future && st === 'pending' ? (mark?.planned ? 'Planeado' : '—') : STATUS_LABEL[st];
    return (
      <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 min-h-[52px]">
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

      {!future && date !== input.today && (
        <Link to={`/hoy?d=${date}`} className="pill-ghost w-full">Abrir este día en Inicio</Link>
      )}
    </>
  );
}
