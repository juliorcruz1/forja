import { ChevronLeft, ChevronRight, Flame, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BadHabitCard } from '../components/BadHabitCard';
import { DayStatusSheet } from '../components/DayStatusSheet';
import { HabitIcon } from '../components/icons';
import { MonthGrid } from '../components/MonthGrid';
import { Bar, Card, Empty, Screen, Segmented } from '../components/ui';
import { WeekStrip } from '../components/WeekStrip';
import type { Habit, HabitLifecycle } from '../db/types';
import { habitStreak, weeklyGoal } from '../domain/habits';
import { habitTally } from '../domain/stats';
import { useData } from '../hooks/useData';
import { addDays, addMonths, type DateKey, formatMonth, monthStart } from '../lib/dates';

const FILTERS: { value: HabitLifecycle; label: string }[] = [
  { value: 'active', label: 'Activos' },
  { value: 'paused', label: 'Pausados' },
  { value: 'archived', label: 'Archivados' },
];

export function HabitsScreen() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'malos' ? 'malos' : 'buenos';
  const [filter, setFilter] = useState<HabitLifecycle>('active');
  const nav = useNavigate();
  if (!data) return null;

  return (
    <Screen
      title="Hábitos"
      right={
        <button
          className="w-11 h-11 rounded-full bg-violet text-white flex items-center justify-center active:scale-95 transition"
          aria-label={tab === 'malos' ? 'Nuevo hábito malo' : 'Nuevo hábito'}
          onClick={() => nav(tab === 'malos' ? '/malos/nuevo' : '/habitos/nuevo')}
        >
          <Plus size={22} />
        </button>
      }
    >
      <Segmented
        value={tab}
        options={[{ value: 'buenos', label: 'Buenos' }, { value: 'malos', label: 'Malos' }]}
        onChange={(v) => setParams(v === 'malos' ? { tab: 'malos' } : {}, { replace: true })}
      />
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4">
        {FILTERS.map((f) => (
          <button key={f.value} className={filter === f.value ? 'chip-on' : 'chip-off'} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      {tab === 'buenos' ? <GoodHabits filter={filter} /> : <BadHabits filter={filter} />}
    </Screen>
  );
}

function GoodHabits({ filter }: { filter: HabitLifecycle }) {
  const data = useData()!;
  const { habits, idx, today } = data;
  const list = habits.filter((h) => h.lifecycle === filter);
  const weekly = list.filter((h) => h.frequency.type === 'weekly');
  const others = list.filter((h) => h.frequency.type !== 'weekly');
  const [month, setMonth] = useState<DateKey>(monthStart(today));
  const [monthHabitId, setMonthHabitId] = useState<string | undefined>(undefined);
  const [edit, setEdit] = useState<{ habit: Habit; date: DateKey } | null>(null);

  if (list.length === 0) {
    return (
      <Empty>
        {filter === 'active' ? 'No tienes hábitos activos. Toca + para crear uno.' : filter === 'paused' ? 'No hay hábitos en pausa.' : 'No hay hábitos archivados.'}
      </Empty>
    );
  }

  const monthHabit = list.find((h) => h.id === monthHabitId) ?? weekly[0] ?? list[0];

  return (
    <>
      {filter === 'active' &&
        weekly.map((h) => {
          const g = weeklyGoal(h, idx, today);
          return (
            <Card key={h.id}>
              <Link to={`/habitos/${h.id}`} className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-violet-soft text-violet-text flex items-center justify-center">
                    <HabitIcon name={h.icon} />
                  </span>
                  <div>
                    <p className="font-semibold">{h.name}</p>
                    <p className="text-[13px] text-muted">Meta semanal</p>
                  </div>
                </div>
                <p className="text-2xl font-bold">
                  {g.count}<span className="text-muted text-base font-medium"> de {g.target}</span>
                </p>
              </Link>
              <WeekStrip habit={h} idx={idx} today={today} />
              <p className="text-[13px] text-muted mt-3">
                {g.state === 'met'
                  ? g.message
                  : `${g.message.replace(/\.$/, '')}. Toca un día para planearlo o moverlo.`}
              </p>
            </Card>
          );
        })}

      {filter === 'active' && monthHabit && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <button className="icon-btn -ml-2" aria-label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft size={20} />
            </button>
            <p className="font-semibold">{formatMonth(month)}</p>
            <button
              className="icon-btn -mr-2 disabled:opacity-30"
              aria-label="Mes siguiente"
              disabled={addMonths(month, 1) > today}
              onClick={() => setMonth(addMonths(month, 1))}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-3">
            {list.map((h) => (
              <button key={h.id} className={h.id === monthHabit.id ? 'chip-on' : 'chip-off'} onClick={() => setMonthHabitId(h.id)}>
                {h.name}
              </button>
            ))}
          </div>
          <MonthGrid habit={monthHabit} idx={idx} today={today} month={month} onDay={(d) => setEdit({ habit: monthHabit, date: d })} />
          <p className="text-[12px] text-dim mt-3">Toca un día para editar su registro.</p>
        </Card>
      )}

      <div className="space-y-2.5">
        {(filter === 'active' ? others : list).map((h) => (
          <HabitRowCard key={h.id} habit={h} />
        ))}
      </div>

      <DayStatusSheet habit={edit?.habit ?? null} date={edit?.date ?? today} idx={idx} onClose={() => setEdit(null)} />
    </>
  );
}

function HabitRowCard({ habit }: { habit: Habit }) {
  const { idx, today } = useData()!;
  const t = habitTally(habit, idx, addDays(today, -29), today, today);
  const s = habitStreak(habit, idx, today);
  return (
    <Link to={`/habitos/${habit.id}`} className="card p-4 flex items-center gap-3 active:scale-[0.99] transition">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${habit.required ? 'bg-violet-soft text-violet-text' : 'bg-blue-soft text-blue-text'}`}>
        <HabitIcon name={habit.icon} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium truncate">{habit.name}</p>
          <span className="flex items-center gap-1 text-[13px] text-muted shrink-0">
            <Flame size={14} className="text-violet-text" />
            {s.current} {s.unit === 'semanas' ? 'sem' : 'd'}
          </span>
        </div>
        {habit.required ? (
          <div className="flex items-center gap-2 mt-2">
            <Bar pct={t.pct ?? 0} className="flex-1" />
            <span className="text-[12px] text-muted w-9 text-right">{t.pct === null ? '—' : `${t.pct}%`}</span>
          </div>
        ) : (
          <p className="text-[12px] text-blue-text mt-1">Extra · opcional</p>
        )}
      </div>
    </Link>
  );
}

function BadHabits({ filter }: { filter: HabitLifecycle }) {
  const { badHabits } = useData()!;
  const list = badHabits.filter((b) => b.lifecycle === filter);
  if (list.length === 0) {
    return (
      <Empty>
        {filter === 'active'
          ? 'Aún no registras hábitos malos. Toca + para empezar a contar tus días sin caer.'
          : 'Nada por aquí.'}
      </Empty>
    );
  }
  return (
    <>
      {list.map((b) => (
        <BadHabitCard key={b.id} bad={b} />
      ))}
    </>
  );
}
