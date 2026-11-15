import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HabitIcon } from '../components/icons';
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
  if (!data || !review || review.ws !== ws) return null;
  const { habits, idx, badHabits, relapses } = data;

  const p = periodFor('week', ws);
  const s = periodStats(habits, idx, p, today);
  const ranked = s.perHabit.filter((h) => h.tally.pct !== null).sort((a, b) => b.tally.pct! - a.tally.pct!);
  const best = ranked.slice(0, 2);
  const worst = ranked.length > 2 ? ranked.slice(-2).reverse() : [];
  const weekly = habits.filter((h) => h.frequency.type === 'weekly' && h.lifecycle !== 'archived' && h.startDate <= p.to);
  const relapseTotal = badHabits.reduce((a, b) => a + relapsesInRange(b, relapses, p.from, p.to), 0);
  const go = (n: number) => nav(`/revision/${addDays(ws, 7 * n)}`, { replace: true });

  return (
    <Screen title="Revisión" subtitle={`Semana del ${p.label}`} back="/mas"
      right={
        <>
          <button className="icon-btn" aria-label="Semana anterior" onClick={() => go(-1)}><ChevronLeft size={22} /></button>
          <button className="icon-btn disabled:opacity-25" aria-label="Semana siguiente" disabled={ws >= current} onClick={() => go(1)}><ChevronRight size={22} /></button>
        </>
      }
    >
      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-3xl font-bold">{s.overall.pct === null ? '—' : `${s.overall.pct}%`}</p>
            <p className="text-[11px] text-muted">Cumplimiento</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{s.extras.reduce((a, e) => a + e.days, 0) + s.oneOffDone}</p>
            <p className="text-[11px] text-muted">Extras</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{relapseTotal}</p>
            <p className="text-[11px] text-muted">Recaídas</p>
          </div>
        </div>
        {weekly.map((h) => {
          const g = weeklyGoal(h, idx, today, ws);
          return (
            <p key={h.id} className="mt-4 pt-3 border-t border-line text-[14px] flex items-center gap-2">
              <HabitIcon name={h.icon} size={16} className="text-violet-text" />
              {h.name}: <b>{g.count} de {g.target}</b>
              <span className="text-muted text-[12px]">{g.state === 'met' ? '· meta cumplida' : ''}</span>
            </p>
          );
        })}
      </Card>

      {(best.length > 0 || worst.length > 0) && (
        <div className="grid grid-cols-2 gap-3.5">
          <Card>
            <p className="text-[12px] text-muted mb-2">Mejores</p>
            {best.map((h) => (
              <p key={h.habit.id} className="text-[14px] truncate">{h.habit.name} <span className="text-violet-text">{h.tally.pct}%</span></p>
            ))}
          </Card>
          <Card>
            <p className="text-[12px] text-muted mb-2">A mejorar</p>
            {worst.length ? worst.map((h) => (
              <p key={h.habit.id} className="text-[14px] truncate">{h.habit.name} <span className="text-blue-text">{h.tally.pct}%</span></p>
            )) : <p className="text-[13px] text-dim">—</p>}
          </Card>
        </div>
      )}

      <Answers key={ws} ws={ws} initial={review.r?.answers ?? []} />
    </Screen>
  );
}

function Answers({ ws, initial }: { ws: DateKey; initial: string[] }) {
  const [answers, setAnswers] = useState<string[]>(WEEKLY_REVIEW_QUESTIONS.map((_, i) => initial[i] ?? ''));
  const [saved, setSaved] = useState(false);
  const timer = useRef<number>();
  const latest = useRef(answers);
  const dirty = useRef(false);

  const flush = () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    saveReview(ws, latest.current).then(() => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    });
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {WEEKLY_REVIEW_QUESTIONS.map((q, i) => (
        <Card key={q}>
          <label className="text-[15px] font-semibold block mb-2" htmlFor={`q${i}`}>{q}</label>
          <textarea
            id={`q${i}`}
            rows={3}
            className="w-full bg-transparent outline-none placeholder:text-dim resize-none leading-relaxed"
            placeholder="Escribe aquí…"
            value={answers[i]}
            onChange={(e) => {
              const next = answers.map((a, j) => (j === i ? e.target.value : a));
              setAnswers(next);
              latest.current = next;
              dirty.current = true;
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(flush, 600);
            }}
            onBlur={flush}
          />
        </Card>
      ))}
      <p className={`text-[12px] text-muted flex items-center gap-1 justify-center transition ${saved ? 'opacity-100' : 'opacity-0'}`}>
        <Check size={13} /> Guardado
      </p>
    </>
  );
}
