import { ChevronLeft, ChevronRight, CloudUpload, Flame, Moon, RotateCcw, ClipboardList, Feather } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DayStatusSheet } from '../components/DayStatusSheet';
import { HabitRow } from '../components/HabitRow';
import { HabitIcon } from '../components/icons';
import { Card, ProgressRing, Screen, SectionHeader } from '../components/ui';
import { BRAND } from '../config/brand';
import { backupDue } from '../db/backup';
import { setHeavyDay } from '../db/repo';
import type { Habit } from '../db/types';
import { badHabitStats } from '../domain/bad';
import { dayProgress, habitsForDay, isDoneStatus, missedYesterday, overallStreak, showsOnDay } from '../domain/habits';
import { nightInfo } from '../domain/sleep';
import { useData } from '../hooks/useData';
import { addDays, formatLong, formatTime, isValidKey, weekday } from '../lib/dates';

export function TodayScreen() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<Habit | null>(null);
  if (!data) return null;
  const { habits, idx, today, settings, badHabits, relapses, dayMeta } = data;
  const qd = params.get('d');
  const date = qd && isValidKey(qd) && qd <= today ? qd : today;
  const isToday = date === today;
  const go = (n: number) => {
    const d = addDays(date, n);
    setParams(d >= today ? {} : { d }, { replace: true });
  };

  const heavy = !!dayMeta.find((m) => m.date === date)?.heavy;
  const progress = dayProgress(habits, date, idx, today);
  const streak = overallStreak(habits, idx, today);
  const { required, extras } = habitsForDay(habits.filter((h) => h.lifecycle !== 'archived'), date);
  const list = required.filter((h) => showsOnDay(h, date));
  const night = nightInfo(settings, date);
  const comeback = isToday && missedYesterday(habits, idx, today);
  const activeBad = badHabits.filter((b) => b.lifecycle === 'active');
  const extrasDone = extras.filter((h) => isDoneStatus(idx.status(h.id, date))).length;
  const isSunday = weekday(date) === 6;
  const needBackup = isToday && backupDue(settings.lastBackupAt);

  const title = isToday ? 'Hoy' : date === addDays(today, -1) ? 'Ayer' : 'Registro';
  const missingText =
    progress.total === 0
      ? 'Sin hábitos obligatorios este día'
      : progress.missing.length === 0
        ? '¡Día completo!'
        : `Falta: ${progress.missing.map((h) => h.name).join(', ')}`;

  return (
    <Screen
      title={title}
      subtitle={formatLong(date)}
      right={
        <>
          <button className="icon-btn" aria-label="Día anterior" onClick={() => go(-1)}>
            <ChevronLeft size={22} />
          </button>
          <button className="icon-btn disabled:opacity-25" aria-label="Día siguiente" disabled={isToday} onClick={() => go(1)}>
            <ChevronRight size={22} />
          </button>
        </>
      }
    >
      {!isToday && (
        <button onClick={() => setParams({}, { replace: true })} className="w-full card2 px-4 py-2.5 text-[13px] text-blue-text text-left">
          Estás editando un día pasado. Toca aquí para volver a hoy.
        </button>
      )}

      <Card>
        <div className="flex items-center gap-4">
          <ProgressRing pct={progress.pct}>
            <span className="text-xl font-bold">{progress.total ? `${progress.pct}%` : '—'}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">
              {progress.done} de {progress.total} hábitos
            </p>
            <p className="text-[13px] text-muted mt-0.5 line-clamp-2">{missingText}</p>
            <div className="flex items-center gap-3 mt-2 text-[13px]">
              <span className="flex items-center gap-1 text-violet-text">
                <Flame size={15} /> {streak} {streak === 1 ? 'día' : 'días'} de racha
              </span>
              {extrasDone > 0 && <span className="text-blue-text">+{extrasDone} extra</span>}
            </div>
          </div>
        </div>
      </Card>

      {needBackup && (
        <Link to="/ajustes#respaldo" className="card2 px-4 py-3 flex items-center gap-3 text-[13px]">
          <CloudUpload size={18} className="text-blue-text shrink-0" />
          <span className="flex-1">
            <b className="font-semibold">{BRAND.backupReminder}.</b>{' '}
            <span className="text-muted">Tus datos viven solo en este teléfono.</span>
          </span>
        </Link>
      )}

      {night.critical && (
        <div className="rounded-card border p-4 flex gap-3 animate-fadeUp" style={{ background: '#1A1530', borderColor: '#3A2F66' }}>
          <Moon size={20} className="text-night-text shrink-0 mt-0.5" />
          <div className="text-night-text">
            <p className="font-semibold">Noche crítica</p>
            <p className="text-[14px] opacity-90">
              Mañana entras a las {formatTime(night.nextStart!)}. Acuéstate a las {formatTime(night.bedtime)}.
            </p>
          </div>
        </div>
      )}

      {comeback && (
        <div className="card p-4 flex gap-3 border-violet/40">
          <RotateCcw size={20} className="text-violet-text shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{BRAND.comebackTitle}</p>
            <p className="text-[13px] text-muted">{BRAND.comebackBody}</p>
          </div>
        </div>
      )}

      {isSunday && isToday && (
        <Link to="/revision" className="card p-4 flex items-center gap-3 active:scale-[0.99] transition">
          <ClipboardList size={20} className="text-blue-text" />
          <div className="flex-1">
            <p className="font-semibold">Revisión semanal</p>
            <p className="text-[13px] text-muted">Cinco minutos para mirar tu semana.</p>
          </div>
          <ChevronRight size={18} className="text-dim" />
        </Link>
      )}

      <SectionHeader
        title="Hábitos de hoy"
        right={
          <button
            onClick={() => setHeavyDay(date, !heavy)}
            className={`${heavy ? 'chip-on' : 'chip-off'} gap-1.5`}
            aria-pressed={heavy}
          >
            <Feather size={14} /> Modo día pesado
          </button>
        }
      />
      {heavy && <p className="text-[13px] text-blue-text px-1 -mt-1">{BRAND.heavyDayBody}</p>}
      <div className="space-y-2.5">
        {list.length === 0 && <p className="text-sm text-muted px-1">No hay hábitos programados para este día.</p>}
        {list.map((h) => (
          <HabitRow key={h.id} habit={h} date={date} today={today} idx={idx} settings={settings} heavy={heavy} onOpen={() => setOpen(h)} />
        ))}
      </div>

      {extras.length > 0 && (
        <>
          <SectionHeader title="Extras" right={extrasDone > 0 ? <span className="text-[13px] text-blue-text">+{extrasDone} extra</span> : undefined} />
          <div className="space-y-2.5">
            {extras.map((h) => (
              <HabitRow key={h.id} habit={h} date={date} today={today} idx={idx} settings={settings} heavy={false} onOpen={() => setOpen(h)} />
            ))}
          </div>
        </>
      )}

      {activeBad.length > 0 && (
        <>
          <SectionHeader title="Días sin" right={<Link to="/habitos?tab=malos" className="text-[13px] text-violet-text min-h-[44px] flex items-center">Ver</Link>} />
          <div className="grid grid-cols-2 gap-2.5">
            {activeBad.map((b) => {
              const s = badHabitStats(b, relapses, today);
              return (
                <Link key={b.id} to="/habitos?tab=malos" className="card p-3.5">
                  <div className="flex items-center gap-2 text-muted text-[12px]">
                    <HabitIcon name={b.icon} size={14} />
                    <span className="truncate">{b.name}</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">
                    {s.current}
                    <span className="text-[13px] font-medium text-muted"> {s.current === 1 ? 'día' : 'días'}</span>
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <DayStatusSheet habit={open} date={date} idx={idx} onClose={() => setOpen(null)} />
    </Screen>
  );
}
