import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HabitIcon } from '../components/icons';
import { SaveBar, SaveStatus, useAutoSaver } from '../components/SaveBits';
import { AutoSaver, leaveSafely } from '../lib/autosave';
import { Card, Screen } from '../components/ui';
import { WEEKLY_REVIEW_QUESTIONS } from '../config/defaults';
import { db } from '../db/db';
import { saveReview } from '../db/repo';
import { relapsesInRange } from '../domain/bad';
import { weeklyGoal } from '../domain/habits';
import { periodFor, periodStats } from '../domain/stats';
import { useData } from '../hooks/useData';
import { addDays, type DateKey, isValidKey, weekStart } from '../lib/dates';

export function WeeklyReviewScreen() {
  const { week } = useParams();
  const data = useData();
  const nav = useNavigate();
  const today = data?.today ?? '';
  const current = today ? weekStart(today) : '';
  const ws: DateKey = week && isValidKey(week) && weekStart(week) === week && week <= current ? week : current;
  const review = useLiveQuery(async () => ({ ws, r: await db.reviews.get(ws) }), [ws]);
  const [saver, saveState] = useAutoSaver(
    () => new AutoSaver<ReviewPatch>({ save: (p) => (p.answers ? saveReview(ws, p.answers) : Promise.resolve()), draftKey: reviewDraftKey(ws) }),
    [ws],
  );
  const loaded = review?.ws === ws ? review.r : undefined;
  useEffect(() => {
    if (loaded?.answers.some((a) => a.trim())) saver.noteStored(new Date(loaded.updatedAt));
  }, [saver, loaded]);
  if (!data || !review || review.ws !== ws) return null;
  const { habits, idx, badHabits, relapses } = data;

  const p = periodFor('week', ws);
  const s = periodStats(habits, idx, p, today);
  const ranked = s.perHabit.filter((h) => h.tally.pct !== null).sort((a, b) => b.tally.pct! - a.tally.pct!);
  const best = ranked.slice(0, 2);
  const worst = ranked.length > 2 ? ranked.slice(-2).reverse() : [];
  const weekly = habits.filter((h) => h.frequency.type === 'weekly' && h.lifecycle !== 'archived' && h.startDate <= p.to);
  const relapseTotal = badHabits.reduce((a, b) => a + relapsesInRange(b, relapses, p.from, p.to), 0);
  const go = (n: number) => leaveSafely(() => nav(`/revision/${addDays(ws, 7 * n)}`, { replace: true }));

  return (
    <Screen title="Revisión" subtitle={`Semana del ${p.label}`} back="/mas"
      titleAside={<SaveStatus state={saveState} onRetry={() => void saver.retry()} />}
      right={
        <>
          <button className="icon-btn" aria-label="Semana anterior" onClick={() => go(-1)}><ChevronLeft size={22} /></button>
          <button className="icon-btn disabled:opacity-25" aria-label="Semana siguiente" disabled={ws >= current} onClick={() => go(1)}><ChevronRight size={22} /></button>
        </>
      }
    >
      <Card>
        <div className="grid gap-2 text-center grid-cols-[repeat(auto-fit,minmax(6rem,1fr))]">
          <div>
            <p className="text-3xl font-bold">{s.overall.pct === null ? '—' : `${s.overall.pct}%`}</p>
            <p className="text-[0.6875rem] text-muted">Cumplimiento</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{s.extras.reduce((a, e) => a + e.days, 0) + s.oneOffDone}</p>
            <p className="text-[0.6875rem] text-muted">Extras</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{relapseTotal}</p>
            <p className="text-[0.6875rem] text-muted">Recaídas</p>
          </div>
        </div>
        {weekly.map((h) => {
          const g = weeklyGoal(h, idx, today, ws);
          return (
            <p key={h.id} className="mt-4 pt-3 border-t border-line text-[0.875rem] flex items-center gap-2">
              <HabitIcon name={h.icon} size={16} className="text-violet-text" />
              {h.name}: <b>{g.count} de {g.target}</b>
              <span className="text-muted text-[0.75rem]">{g.state === 'met' ? '· meta cumplida' : ''}</span>
            </p>
          );
        })}
      </Card>

      {(best.length > 0 || worst.length > 0) && (
        <div className="grid grid-cols-2 gap-3.5">
          <Card>
            <p className="text-[0.75rem] text-muted mb-2">Mejores</p>
            {best.map((h) => (
              <p key={h.habit.id} className="text-[0.875rem] flex gap-1 min-w-0"><span className="truncate">{h.habit.name}</span> <span className="text-violet-text shrink-0">{h.tally.pct}%</span></p>
            ))}
          </Card>
          <Card>
            <p className="text-[0.75rem] text-muted mb-2">A mejorar</p>
            {worst.length ? worst.map((h) => (
              <p key={h.habit.id} className="text-[0.875rem] flex gap-1 min-w-0"><span className="truncate">{h.habit.name}</span> <span className="text-blue-text shrink-0">{h.tally.pct}%</span></p>
            )) : <p className="text-[0.8125rem] text-dim">—</p>}
          </Card>
        </div>
      )}

      <Answers key={ws} saver={saver} initial={review.r?.answers ?? []} updatedAt={review.r?.updatedAt} />

      <Link to={`/imprimir/${ws}?modo=archivo`} className="pill-ghost w-full">
        <Printer size={17} /> Imprimir / Guardar PDF
      </Link>
      <p className="text-[0.75rem] text-dim text-center -mt-1">
        Hoja para la pared, registro de la semana u hoja de planeación.
      </p>
    </Screen>
  );
}

type ReviewPatch = { answers: string[] };
export const reviewDraftKey = (ws: DateKey) => `forja.borrador.revision.${ws}`;

function Answers({ saver, initial, updatedAt }: { saver: AutoSaver<ReviewPatch>; initial: string[]; updatedAt?: string }) {
  const [recovered] = useState(() => saver.readDraft(updatedAt)?.answers);
  const [answers, setAnswers] = useState<string[]>(() => WEEKLY_REVIEW_QUESTIONS.map((_, i) => (recovered ?? initial)[i] ?? ''));

  useEffect(() => {
    if (recovered) {
      saver.change({ answers: recovered });
      void saver.flush();
    }
  }, [saver, recovered]);

  const flush = () => void saver.flush();

  return (
    <>
      {WEEKLY_REVIEW_QUESTIONS.map((q, i) => (
        <Card key={q}>
          <label className="text-[0.9375rem] font-semibold block mb-2" htmlFor={`q${i}`}>{q}</label>
          <textarea
            id={`q${i}`}
            rows={3}
            className="w-full bg-transparent outline-none placeholder:text-dim resize-none leading-relaxed"
            placeholder="Escribe aquí…"
            value={answers[i]}
            onChange={(e) => {
              const next = answers.map((a, j) => (j === i ? e.target.value : a));
              setAnswers(next);
              saver.change({ answers: next });
            }}
            onBlur={flush}
          />
        </Card>
      ))}
      <SaveBar saver={saver} />
    </>
  );
}
