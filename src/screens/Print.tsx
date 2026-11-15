import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Segmented } from '../components/ui';
import { WEEKLY_REVIEW_QUESTIONS } from '../config/defaults';
import { db } from '../db/db';
import { updateSettings } from '../db/repo';
import { earnedOn } from '../domain/medals';
import { archiveMark, buildPrintWeek, type PrintMode, type PrintRow, type PrintWeek } from '../domain/print';
import { PUNISH_LABEL } from '../domain/punish';
import { useData } from '../hooks/useData';
import { addDays, type DateKey, formatLong, formatShort, formatTime, isValidKey, WEEKDAY_LETTER, weekStart } from '../lib/dates';

const MODES: { value: PrintMode; label: string }[] = [
  { value: 'pared', label: 'Pared' },
  { value: 'archivo', label: 'Archivo' },
  { value: 'plan', label: 'Planear' },
];
const MODE_TITLE: Record<PrintMode, string> = { pared: 'Mi semana', archivo: 'Registro de la semana', plan: 'Planeación de la semana' };
const MODE_HINT: Record<PrintMode, string> = {
  pared: 'Para pegar en la pared y marcar a mano.',
  archivo: 'Lo que pasó de verdad, sacado de tus registros.',
  plan: 'Una hoja para planear la semana con calma.',
};

/** Weekly printouts. Route: /imprimir/:week?modo=pared|archivo|plan */
export function PrintScreen() {
  const data = useData();
  const { week } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const journal = useLiveQuery(() => db.journal.toArray(), []);
  const today = data?.today ?? '';
  const ws: DateKey = week && isValidKey(week) ? weekStart(week) : weekStart(today || '2026-01-05');
  const mode = (MODES.some((m) => m.value === params.get('modo')) ? params.get('modo') : 'archivo') as PrintMode;
  const w = useMemo(
    () =>
      data && journal
        ? buildPrintWeek(ws, {
          habits: data.habits, idx: data.idx, badHabits: data.badHabits, relapses: data.relapses, usageLogs: data.usageLogs,
          settings: data.settings, dayMeta: data.dayMeta, jokers: data.jokers, points: data.points, debts: data.debts,
          medals: data.medals, medalDates: (m) => earnedOn(m, data.medalUnlocks), reviews: data.reviews, journal, today: data.today,
        })
        : null,
    [data, journal, ws],
  );
  if (!data || !w) return null;
  const paper = data.settings.paperSize;
  const go = (n: number) => nav(`/imprimir/${addDays(ws, 7 * n)}?modo=${mode}`, { replace: true });

  return (
    <div className="print-root safe-top pb-nav px-4 max-w-[480px] md:max-w-[56rem] mx-auto">
      <style>{`@page { size: ${paper === 'a4' ? 'A4' : 'letter'} portrait; margin: 12mm; }`}</style>
      <div className="no-print space-y-3 pb-4">
        <header className="flex items-end gap-1 pt-3">
          <button className="icon-btn -ml-3 mb-0.5" aria-label="Volver" onClick={() => nav(-1)}>
            <ChevronLeft size={24} />
          </button>
          <div className="min-w-0">
            <p className="text-[0.8125rem] text-muted font-medium">Imprimir / Guardar PDF</p>
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Hoja semanal</h1>
          </div>
        </header>
        <Segmented value={mode} options={MODES} onChange={(m) => setParams({ modo: m }, { replace: true })} />
        <div className="flex items-center gap-1">
          <button className="icon-btn -ml-2" aria-label="Semana anterior" onClick={() => go(-1)}><ChevronLeft size={22} /></button>
          <p className="flex-1 text-center font-semibold">{formatShort(ws)} – {formatShort(addDays(ws, 6))}</p>
          <button className="icon-btn" aria-label="Semana siguiente" onClick={() => go(1)}><ChevronRight size={22} /></button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.8125rem] text-muted flex-1">{MODE_HINT[mode]}</span>
          {(['letter', 'a4'] as const).map((s) => (
            <button key={s} className={paper === s ? 'chip-on' : 'chip-off'} aria-pressed={paper === s} onClick={() => updateSettings({ paperSize: s })}>
              {s === 'letter' ? 'Carta' : 'A4'}
            </button>
          ))}
        </div>
        <button className="pill-primary w-full" onClick={() => window.print()}>
          <Printer size={17} /> Imprimir / Guardar PDF
        </button>
        <p className="text-[0.75rem] text-dim">
          En iPhone se abre la hoja de impresión: elige tu impresora (AirPrint) o toca Compartir → Guardar en Archivos para
          tener el PDF. La hoja siempre sale en blanco y negro claro, sin el fondo oscuro.
        </p>
      </div>

      <article className={`print-sheet ${paper === 'a4' ? 'paper-a4' : 'paper-letter'}`} data-testid="print-sheet" data-mode={mode}>
        <SheetHeader w={w} mode={mode} name={data.settings.userName} />
        {mode === 'pared' && <WallSheet w={w} />}
        {mode === 'archivo' && <ArchiveSheet w={w} currency={data.settings.punish.currency} />}
        {mode === 'plan' && <PlanSheet w={w} />}
        <p className="ps-foot">FORJA · {MODE_TITLE[mode]} · {w.label}</p>
      </article>
    </div>
  );
}

function SheetHeader({ w, mode, name }: { w: PrintWeek; mode: PrintMode; name: string }) {
  return (
    <header className="ps-head">
      <div>
        <p className="ps-kicker">FORJA{name ? ` · ${name}` : ''}</p>
        <h2 className="ps-title">{MODE_TITLE[mode]}</h2>
      </div>
      <p className="ps-week">Semana del {w.label}</p>
    </header>
  );
}

function DayHead({ w, extra = true }: { w: PrintWeek; extra?: boolean }) {
  return (
    <thead>
      <tr>
        <th className="ps-name-col" />
        {w.days.map((d) => (
          <th key={d.date} className="ps-day">
            <span className="ps-day-label">{d.label}</span>
            {extra && <span className="ps-day-sub">{d.work ? formatTime(d.work.start) : 'Libre'}</span>}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function rowName(r: PrintRow) {
  return (
    <th scope="row" className="ps-name">
      {r.name}
      {r.group === 'extra' && <span className="ps-sub"> (opcional)</span>}
      {r.group === 'oneOff' && <span className="ps-sub"> (solo ese día)</span>}
      {r.weekly && <span className="ps-sub"> · meta {r.weekly.target}</span>}
      {r.minVersion && <span className="ps-min">mín: {r.minVersion}</span>}
    </th>
  );
}

/** Wall: empty boxes to tick by hand. Not scheduled = shaded; Gym planned days marked "P". */
function WallSheet({ w }: { w: PrintWeek }) {
  const pending = w.debts.filter((d) => d.status === 'pending');
  return (
    <>
      <table className="ps-table ps-wall">
        <DayHead w={w} />
        <tbody>
          {w.rows.map((r) => (
            <tr key={r.habitId}>
              {rowName(r)}
              {r.cells.map((c) => (
                <td key={c.date} className={!c.active ? 'ps-off' : !c.scheduled ? 'ps-rest' : ''}>
                  {c.active && c.scheduled && <span className={`ps-box ${c.planned ? 'ps-planned' : ''}`}>{c.planned ? 'P' : ''}</span>}
                </td>
              ))}
            </tr>
          ))}
          {w.bad.map((b) => (
            <tr key={b.id}>
              <th scope="row" className="ps-name">
                {b.mode === 'limit' ? `${b.name} (≤ ${b.limit} min)` : `Sin ${b.name}`}
              </th>
              {w.days.map((d) => (
                <td key={d.date}>{b.mode === 'limit' ? <span className="ps-line">min</span> : <span className="ps-box" />}</td>
              ))}
            </tr>
          ))}
          <tr className="ps-night">
            <th scope="row" className="ps-name">Dormir</th>
            {w.days.map((d) => (
              <td key={d.date}>{formatTime(d.bedtime)}{d.critical ? ' *' : ''}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="ps-note">P = día planeado para tu meta semanal. Gris = no toca ese día. * = noche crítica: al día siguiente entras temprano.</p>
      <div className="ps-cols">
        <section>
          <h3 className="ps-h3">Si fallas un día</h3>
          <p>No pasa nada: hoy toca volver. Lo importante es no fallar dos veces seguidas.</p>
          {pending.length > 0 && (
            <>
              <h3 className="ps-h3">Deudas por pagar</h3>
              <ul className="ps-list">{pending.map((d) => <li key={d.date}>☐ {d.detail || d.label}</li>)}</ul>
            </>
          )}
        </section>
        <section>
          <h3 className="ps-h3">Notas</h3>
          <div className="ps-lines" style={{ ['--n' as string]: 4 }} />
        </section>
      </div>
    </>
  );
}

/** Archive: real marks from the records. */
function ArchiveSheet({ w, currency }: { w: PrintWeek; currency: string }) {
  const debtStatus: Record<string, string> = { pending: 'pendiente', paid: 'pagada', reset: 'reiniciada', jar: 'al frasco' };
  const relapses = w.bad.filter((b) => b.mode === 'days').reduce((a, b) => a + b.total, 0);
  return (
    <>
      <div className="ps-stats">
        <div><b>{w.overall.pct === null ? '—' : `${w.overall.pct}%`}</b><span>Cumplimiento ({w.overall.done}/{w.overall.total})</span></div>
        <div><b>{w.points >= 0 ? '+' : ''}{w.points}</b><span>Puntos</span></div>
        {w.rows.filter((r) => r.weekly).map((r) => (
          <div key={r.habitId}><b>{r.weekly!.count}/{r.weekly!.target}</b><span>{r.name}{r.weekly!.met ? ' · meta cumplida' : ''}</span></div>
        ))}
        <div><b>{relapses}</b><span>Recaídas</span></div>
      </div>
      <table className="ps-table">
        <DayHead w={w} extra={false} />
        <tbody>
          {w.rows.map((r) => (
            <tr key={r.habitId}>
              {rowName(r)}
              {r.cells.map((c) => (
                <td key={c.date} className={!c.active ? 'ps-off' : ''}>{archiveMark(c, w.today)}</td>
              ))}
            </tr>
          ))}
          {w.bad.map((b) => (
            <tr key={b.id}>
              <th scope="row" className="ps-name">{b.mode === 'limit' ? `${b.name} (min, límite ${b.limit})` : `${b.name} (recaídas)`}</th>
              {b.perDay.map((v, i) => (
                <td key={i}>{w.days[i].date > w.today || v === undefined ? '' : b.mode === 'limit' ? v : v === 0 ? '·' : v}</td>
              ))}
            </tr>
          ))}
          <tr className="ps-total">
            <th scope="row" className="ps-name">Día (%)</th>
            {w.days.map((d) => (
              <td key={d.date}>{d.pct === null ? '' : d.pct}{d.joker ? ' C' : ''}{d.heavy ? ' P' : ''}</td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="ps-name">Puntos</th>
            {w.days.map((d) => <td key={d.date}>{d.points === undefined ? '' : d.points}</td>)}
          </tr>
        </tbody>
      </table>
      <p className="ps-note">✓ completo · M mínimo · D descanso · – no cumplido · C comodín · P día pesado. Hasta {formatLong(w.today < w.to ? w.today : w.to).toLowerCase()}.</p>

      <div className="ps-cols">
        <section>
          <h3 className="ps-h3">Castigos</h3>
          {w.debts.length === 0 ? <p>Ninguno esta semana.</p> : (
            <ul className="ps-list">
              {w.debts.map((d) => (
                <li key={d.date}>{formatShort(d.date)}: {d.detail || d.label} — {debtStatus[d.status]}{d.type === 'jar' ? ` (${currency}${d.amount})` : ''} · {PUNISH_LABEL[d.type]}</li>
              ))}
            </ul>
          )}
          <h3 className="ps-h3">Medallas ganadas</h3>
          {w.medals.length === 0 ? <p>—</p> : <ul className="ps-list">{w.medals.map((m) => <li key={m.title}>{m.title} ({formatShort(m.date)})</li>)}</ul>}
        </section>
        <section>
          <h3 className="ps-h3">Diario</h3>
          {w.days.some((d) => d.journalLine) ? (
            <ul className="ps-list">{w.days.filter((d) => d.journalLine).map((d) => <li key={d.date}><b>{d.label}:</b> {d.journalLine}</li>)}</ul>
          ) : <p>—</p>}
        </section>
      </div>
      <h3 className="ps-h3">Revisión semanal</h3>
      {WEEKLY_REVIEW_QUESTIONS.map((q, i) => (
        <div key={q} className="ps-qa">
          <p className="ps-q">{q}</p>
          {w.review[i]?.trim() ? <p className="ps-a">{w.review[i]}</p> : <div className="ps-lines" style={{ ['--n' as string]: 2 }} />}
        </div>
      ))}
    </>
  );
}

/** Planning sheet: priorities, the days of the week with work/sleep/Gym, and room to write. */
function PlanSheet({ w }: { w: PrintWeek }) {
  const weekly = w.rows.filter((r) => r.weekly);
  const mins = w.rows.filter((r) => r.minVersion && r.group === 'required');
  return (
    <>
      <div className="ps-cols">
        <section>
          <h3 className="ps-h3">Mis 3 prioridades</h3>
          <ol className="ps-prio"><li /><li /><li /></ol>
        </section>
        <section>
          <h3 className="ps-h3">Lo que voy a ajustar</h3>
          {w.previousAdjust ? <p className="ps-a">{w.previousAdjust}</p> : <div className="ps-lines" style={{ ['--n' as string]: 3 }} />}
        </section>
      </div>
      <table className="ps-table ps-plan">
        <thead>
          <tr>
            <th className="ps-name-col">Día</th>
            <th>Trabajo</th>
            <th>Dormir</th>
            {weekly.map((r) => <th key={r.habitId}>{r.name}</th>)}
            <th className="ps-wide">Plan del día</th>
          </tr>
        </thead>
        <tbody>
          {w.days.map((d, i) => (
            <tr key={d.date}>
              <th scope="row" className="ps-name">{d.label}</th>
              <td>{d.work ? `${formatTime(d.work.start)} – ${formatTime(d.work.end)}` : 'Libre'}</td>
              <td>{formatTime(d.bedtime)}{d.critical ? ' *' : ''}</td>
              {weekly.map((r) => (
                <td key={r.habitId}><span className={`ps-box ${r.cells[i].planned ? 'ps-planned' : ''}`}>{r.cells[i].planned ? 'P' : ''}</span></td>
              ))}
              <td className="ps-wide"><span className="ps-line" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ps-note">
        {weekly.map((r) => {
          const days = r.cells.map((c, k) => (c.planned ? WEEKDAY_LETTER[k] : null)).filter(Boolean);
          return `${r.name}: meta ${r.weekly!.target} · planeado ${days.length ? days.join(' ') : 'ningún día (márcalos arriba)'}`;
        }).join(' · ')}
        {weekly.length ? '. ' : ''}* = noche crítica.
      </p>
      {mins.length > 0 && (
        <>
          <h3 className="ps-h3">Si el día se pone pesado: versión mínima</h3>
          <ul className="ps-list ps-two">{mins.map((r) => <li key={r.habitId}>{r.name}: {r.minVersion}</li>)}</ul>
        </>
      )}
      <h3 className="ps-h3">Notas</h3>
      <div className="ps-lines" style={{ ['--n' as string]: 5 }} />
    </>
  );
}
