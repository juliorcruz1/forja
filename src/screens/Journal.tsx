import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SaveBar, SaveStatus, useAutoSaver } from '../components/SaveBits';
import { Card, Empty, Screen, SectionHeader } from '../components/ui';
import { AutoSaver } from '../lib/autosave';
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
  // Keyed by date: each day (today or a past one) gets its own editor and saver.
  return <JournalPage key={date} date={date} today={today} entry={q.entry} recent={q.recent} />;
}

type JournalPatch = Partial<Omit<JournalEntry, 'id' | 'date' | 'createdAt' | 'updatedAt'>>;

export const journalDraftKey = (date: DateKey) => `forja.borrador.diario.${date}`;

function JournalPage({ date, today, entry, recent }: { date: DateKey; today: DateKey; entry?: JournalEntry; recent: JournalEntry[] }) {
  const previous = recent.filter((e) => e.date !== date && hasContent(e)).slice(0, 7);
  const [saver, state] = useAutoSaver(
    () => new AutoSaver<JournalPatch>({
      save: (p) => saveJournal(date, p),
      draftKey: journalDraftKey(date),
      savedAt: entry && hasContent(entry) ? new Date(entry.updatedAt) : undefined,
    }),
    [date],
  );

  return (
    <Screen
      title="Diario"
      subtitle={formatLong(date)}
      titleAside={<SaveStatus state={state} onRetry={() => void saver.retry()} />}
      back={date !== today ? '/diario' : undefined}
      right={
        <Link to="/diario/historial" className="pill-ghost text-[0.8125rem] px-3.5">
          <History size={16} /> Historial
        </Link>
      }
    >
      <Editor saver={saver} initial={entry} />
      <SaveBar saver={saver} />

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

function Editor({ saver, initial }: { saver: AutoSaver<JournalPatch>; initial: JournalEntry | undefined }) {
  // Text left by a save that never finished (e.g. iOS closed the app) wins over the stored entry.
  const [recovered] = useState(() => saver.readDraft(initial?.updatedAt));
  const [draft, setDraft] = useState<Record<TextField, string>>(() => {
    const r = recovered as Partial<Record<TextField, string>> | undefined;
    return {
      line: r?.line ?? initial?.line ?? '',
      reflection: r?.reflection ?? initial?.reflection ?? '',
      gratitude: r?.gratitude ?? initial?.gratitude ?? '',
      learning: r?.learning ?? initial?.learning ?? '',
      notes: r?.notes ?? initial?.notes ?? '',
    };
  });
  const [mood, setMood] = useState<Mood | undefined>(recovered && 'mood' in recovered ? recovered.mood : initial?.mood);

  useEffect(() => {
    if (recovered) {
      saver.change(recovered);
      void saver.flush();
    }
  }, [saver, recovered]);

  const change = (k: TextField, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    saver.change({ [k]: v });
  };
  const flush = () => void saver.flush();

  return (
    <>
      <Card>
        <p className="text-[0.9375rem] font-semibold mb-3">¿Cómo estuvo el día?</p>
        <div className="flex gap-2 flex-wrap">
          {MOODS.map((m) => (
            <button
              key={m.value}
              className={mood === m.value ? 'chip-on' : 'chip-off'}
              aria-pressed={mood === m.value}
              onClick={() => {
                const next = mood === m.value ? undefined : m.value;
                setMood(next);
                saver.change({ mood: next });
                flush();
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Card>
      {FIELDS.map((f) => (
        <Card key={f.key}>
          <label className="text-[0.9375rem] font-semibold block mb-2" htmlFor={`j-${f.key}`}>
            {f.title}
          </label>
          {f.rows === 1 ? (
            <input
              id={`j-${f.key}`}
              className="w-full min-h-[44px] bg-transparent outline-none placeholder:text-dim text-ink"
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
          <p className="text-[0.875rem] font-medium">{formatLong(e.date)}</p>
          {e.mood && <span className="text-[0.6875rem] px-2 py-0.5 rounded-full bg-violet-soft text-violet-text">{MOODS[e.mood - 1].label}</span>}
        </div>
        <p className="text-[0.8125rem] text-muted truncate mt-0.5">{e.line || e.reflection || e.notes || 'Sin línea del día'}</p>
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
          <SectionHeader title={formatMonth(`${k}-01`)} right={<span className="text-[0.75rem] text-dim">{entries.length}</span>} />
          {entries.map((e) => (
            <EntryRow key={e.id} e={e} />
          ))}
        </div>
      ))}
    </Screen>
  );
}
