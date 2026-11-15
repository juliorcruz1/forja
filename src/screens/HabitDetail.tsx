import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { DayStatusSheet } from '../components/DayStatusSheet';
import { HabitIcon } from '../components/icons';
import { MonthGrid } from '../components/MonthGrid';
import { Card, Screen } from '../components/ui';
import { WeekStrip } from '../components/WeekStrip';
import { habitStreak, weeklyGoal } from '../domain/habits';
import { habitTally } from '../domain/stats';
import { pointsForRef } from '../domain/points';

const formatSigned = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('es-MX')}`;
import { useData } from '../hooks/useData';
import { addDays, addMonths, type DateKey, formatMonth, MONTH_NAMES, monthStart } from '../lib/dates';

const FREQ_LABEL = (h: { frequency: { type: string; target?: number; days?: number[] } }) => {
  const f = h.frequency;
  if (f.type === 'daily') return 'Diario';
  if (f.type === 'days') return `${f.days!.length} días por semana`;
  return `${f.target} veces por semana`;
};

export function HabitDetailScreen() {
  const { id } = useParams();
  const data = useData();
  const [month, setMonth] = useState<DateKey | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [edit, setEdit] = useState<DateKey | null>(null);
  if (!data) return null;
  const { idx, today } = data;
  const habit = data.habits.find((h) => h.id === id);
  if (!habit) return <Navigate to="/habitos" replace />;
  const m = month ?? monthStart(today);
  const y = year ?? Number(today.slice(0, 4));
  const streak = habitStreak(habit, idx, today);
  const t30 = habitTally(habit, idx, addDays(today, -29), today, today);
  const tAll = habitTally(habit, idx, habit.startDate, today, today);

  return (
    <Screen
      title={habit.name}
      subtitle={`${FREQ_LABEL(habit)}${habit.required ? '' : ' · Extra'}${habit.lifecycle === 'paused' ? ' · En pausa' : habit.lifecycle === 'archived' ? ' · Archivado' : ''}`}
      back="/habitos"
      right={
        <Link to={`/habitos/${habit.id}/editar`} className="icon-btn" aria-label="Editar hábito">
          <Pencil size={19} />
        </Link>
      }
    >
      <Card>
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-violet-soft text-violet-text flex items-center justify-center">
            <HabitIcon name={habit.icon} size={24} />
          </span>
          <div className="min-w-0">
            {habit.identity && <p className="text-[15px] font-medium">"{habit.identity}"</p>}
            {habit.stackAfter && <p className="text-[13px] text-muted">Después de {habit.stackAfter.replace(/^después de\s*/i, '')}</p>}
            {habit.minVersion && <p className="text-[13px] text-blue-text">Mínimo: {habit.minVersion}</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Stat label="Racha" value={`${streak.current}`} unit={streak.unit} />
          <Stat label="Mejor" value={`${streak.best}`} unit={streak.unit} />
          <Stat label="30 días" value={t30.pct === null ? '—' : `${t30.pct}%`} unit={tAll.pct === null ? '' : `total ${tAll.pct}%`} />
        </div>
        <p className="text-[13px] text-muted mt-3">
          Puntos en los últimos 30 días:{' '}
          <span className="text-violet-text font-semibold">{formatSigned(pointsForRef(data.points, habit.id, addDays(today, -29), today))}</span>
        </p>
      </Card>

      {habit.frequency.type === 'weekly' && (
        <Card>
          <p className="text-[13px] text-muted mb-3">{weeklyGoal(habit, idx, today).message}</p>
          <WeekStrip habit={habit} idx={idx} today={today} />
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-3">
          <button className="icon-btn -ml-2" aria-label="Mes anterior" onClick={() => setMonth(addMonths(m, -1))}><ChevronLeft size={20} /></button>
          <p className="font-semibold">{formatMonth(m)}</p>
          <button className="icon-btn -mr-2 disabled:opacity-30" aria-label="Mes siguiente" disabled={addMonths(m, 1) > today} onClick={() => setMonth(addMonths(m, 1))}>
            <ChevronRight size={20} />
          </button>
        </div>
        <MonthGrid habit={habit} idx={idx} today={today} month={m} onDay={setEdit} />
        <p className="text-[12px] text-dim mt-3">Toca cualquier día pasado para editar su registro.</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <button className="icon-btn -ml-2" aria-label="Año anterior" onClick={() => setYear(y - 1)}><ChevronLeft size={20} /></button>
          <p className="font-semibold">Vista anual {y}</p>
          <button className="icon-btn -mr-2 disabled:opacity-30" aria-label="Año siguiente" disabled={y + 1 > Number(today.slice(0, 4))} onClick={() => setYear(y + 1)}>
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-4">
          {MONTH_NAMES.map((name, i) => {
            const key = `${y}-${String(i + 1).padStart(2, '0')}-01`;
            return (
              <button key={name} className="text-left" onClick={() => setMonth(key)} aria-label={`Ver ${name}`}>
                <p className="text-[11px] text-muted mb-1 capitalize">{name.slice(0, 3)}</p>
                <MonthGrid habit={habit} idx={idx} today={today} month={key} compact />
              </button>
            );
          })}
        </div>
      </Card>

      <DayStatusSheet habit={edit ? habit : null} date={edit ?? today} idx={idx} onClose={() => setEdit(null)} />
    </Screen>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card2 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      <p className="text-[11px] text-dim">{unit}</p>
    </div>
  );
}
