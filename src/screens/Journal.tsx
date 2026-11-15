import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronRight, History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, Empty, Screen, SectionHeader } from '../components/ui';
import { db } from '../db/db';
import { saveJournal } from '../db/repo';
import type { JournalEntry, Mood } from '../db/types';
import { useData } from '../hooks/useData';
import { type DateKey, formatLong, formatMonth, isValidKey } from '../lib/dates';

export const MOODS: { value: Mood; label: string }[] = [
  { value: 1, label: 'Mal' },
  { value: 2, label: 'Regular' },
  { value: 3, label: 'Bien' },
  { value: 4, label: 'Muy bien' },
  { value: 5, label: 'Top' },
];

type TextField = 'line' | 'reflection' | 'gratitude' | 'learning' | 'notes';

const FIELDS: { key: TextField; title: string; placeholder: string; rows: number }[] = [
  { key: 'line', title: 'Una línea del día', placeholder: 'Si hoy fuera una frase…', rows: 1 },
  { key: 'reflection', title: 'Reflexión', placeholder: '¿Qué pasó hoy y cómo lo viví?', rows: 4 },
  { key: 'gratitude', title: 'Gratitud', placeholder: 'Hoy agradezco…', rows: 3 },
  { key: 'learning', title: 'Aprendizaje', placeholder: 'Hoy aprendí…', rows: 3 },
  { key: 'notes', title: 'Notas libres', placeholder: 'Lo que quieras', rows: 4 },
];

const hasContent = (e: JournalEntry) => !!(e.mood || e.line || e.reflection || e.gratitude || e.learning || e.notes);

export function JournalScreen() {
  const { date: param } = useParams();
  const data = useData();
  const today = data?.today ?? '';
  const date: DateKey = param && isValidKey(param) && param <= today ? param : today;
  const q = useLiveQuery(
    async () => ({
      date,
      entry: await db.journal.get(date),
      recent: await db.journal.orderBy('date').reverse().limit(15).toArray(),
    }),
    [date],
  );

  if (!data || !q || q.date !== date) return null;
  const { entry, recent } = q;
  const previous = recent.filter((e) => e.date !== date && hasContent(e)).slice(0, 7);

  return (
    <Screen
      title="Diario"
      subtitle={formatLong(date)}
      back={date !== today ? '/diario' : undefined}
      right={
        <Link to="/diario/historial" className="pill-ghost text-[13px] min-h-[40px] px-3.5">
          <History size={16} /> Historial
        </Link>
      }
    >
      <Editor key={date} date={date} initial={entry} />

      <SectionHeader title="Días anteriores" />
      {previous.length === 0 ? (
        <Empty>Aquí aparecerán tus días anteriores.</Empty>
      ) : (
        <div className="space-y-2">
          {previous.map((e) => (
            <EntryRow key={e.id} e={e} />
          ))}
        </div>
      )}
    </Screen>
  );
}

function Editor({ date, initial }: { date: DateKey; initial: JournalEntry | undefined }) {
  const [draft, setDraft] = useState<Record<TextField, string>>({
    line: initial?.line ?? '',
    reflection: initial?.reflection ?? '',
    gratitude: initial?.gratitude ?? '',
    learning: initial?.learning ?? '',
    notes: initial?.notes ?? '',
  });
  const [mood, setMood] = useState<Mood | undefined>(initial?.mood);
  const [saved, setSaved] = useState(false);
  const pending = useRef<Partial<Record<TextField, string>>>({});
  const timer = useRef<number>();

  const flush = () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length) {
      saveJournal(date, patch).then(() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1200);
      });
    }
  };

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (k: TextField, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    pending.current[k] = v;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  };

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[15px] font-semibold">¿Cómo estuvo el día?</p>
          <span className={`text-[12px] text-muted flex items-center gap-1 transition ${saved ? 'opacity-100' : 'opacity-0'}`}>
            <Check size={13} /> Guardado
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {MOODS.map((m) => (
            <button
              key={m.value}
              className={mood === m.value ? 'chip-on' : 'chip-off'}
              aria-pressed={mood === m.value}
              onClick={() => {
                const next = mood === m.value ? undefined : m.value;
                setMood(next);
                saveJournal(date, { mood: next });
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Card>
      {FIELDS.map((f) => (
        <Card key={f.key}>
          <label className="text-[15px] font-semibold block mb-2" htmlFor={`j-${f.key}`}>
            {f.title}
          </label>
          {f.rows === 1 ? (
            <input
              id={`j-${f.key}`}
              className="w-full bg-transparent outline-none placeholder:text-dim text-ink"
              value={draft[f.key]}
              placeholder={f.placeholder}
              maxLength={140}
              onChange={(e) => change(f.key, e.target.value)}
              onBlur={flush}
            />
          ) : (
            <textarea
              id={`j-${f.key}`}
              className="w-full bg-transparent outline-none placeholder:text-dim text-ink resize-none leading-relaxed"
              rows={f.rows}
              value={draft[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => change(f.key, e.target.value)}
              onBlur={flush}
            />
          )}
        </Card>
      ))}
    </>
  );
}

function EntryRow({ e }: { e: JournalEntry }) {
  return (
    <Link to={`/diario/${e.date}`} className="card p-3.5 flex items-center gap-3 active:scale-[0.99] transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-medium">{formatLong(e.date)}</p>
          {e.mood && <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-soft text-violet-text">{MOODS[e.mood - 1].label}</span>}
        </div>
        <p className="text-[13px] text-muted truncate mt-0.5">{e.line || e.reflection || e.notes || 'Sin línea del día'}</p>
      </div>
      <ChevronRight size={18} className="text-dim shrink-0" />
    </Link>
  );
}

export function JournalHistoryScreen() {
  const data = useData();
  const nav = useNavigate();
  const all = useLiveQuery(() => db.journal.orderBy('date').reverse().toArray(), []);
  const [mood, setMood] = useState<Mood | 0>(0);
  if (!data || !all) return null;
  const list = all.filter(hasContent).filter((e) => !mood || e.mood === mood);
  const groups = new Map<string, JournalEntry[]>();
  for (const e of list) {
    const k = e.date.slice(0, 7);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return (
    <Screen title="Historial" subtitle="Diario" back="/diario">
      <Card>
        <label className="label" htmlFor="jump">Ir a una fecha</label>
        <input
          id="jump"
          type="date"
          className="field"
          max={data.today}
          onChange={(e) => e.target.value && nav(`/diario/${e.target.value}`)}
        />
        <div className="flex gap-2 flex-wrap mt-3">
          <button className={mood === 0 ? 'chip-on' : 'chip-off'} onClick={() => setMood(0)}>Todos</button>
          {MOODS.map((m) => (
            <button key={m.value} className={mood === m.value ? 'chip-on' : 'chip-off'} onClick={() => setMood(m.value)}>
              {m.label}
            </button>
          ))}
        </div>
      </Card>
      {list.length === 0 && <Empty>No hay entradas todavía.</Empty>}
      {[...groups.entries()].map(([k, entries]) => (
        <div key={k} className="space-y-2">
          <SectionHeader title={formatMonth(`${k}-01`)} right={<span className="text-[12px] text-dim">{entries.length}</span>} />
          {entries.map((e) => (
            <EntryRow key={e.id} e={e} />
          ))}
        </div>
      ))}
    </Screen>
  );
}
