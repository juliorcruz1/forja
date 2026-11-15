import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, CloudUpload, Flame, Moon, Plus, Repeat, RotateCcw, ClipboardList, Feather } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type ActionTarget, HabitActionsSheet } from '../components/HabitActionsSheet';
import { useLongPress } from '../hooks/useLongPress';
import type { BadHabit } from '../db/types';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { OneOffSheet } from '../components/OneOffSheet';
import { WindowCard } from '../components/WindowCard';
import { DebtsCard } from '../components/DebtsCard';
import { GreetingCard } from '../components/GreetingCard';
import { QuickActions } from '../components/QuickActions';
import { UsageEntry } from '../components/LimitHabitCard';
import { isLimitHabit, limitOf, usageOn } from '../domain/social';
import { DayPointsChip, JokerRow, LevelChip } from '../components/PointsBits';
import { DayStatusSheet } from '../components/DayStatusSheet';
import { HabitRow } from '../components/HabitRow';
import { HabitIcon } from '../components/icons';
import { Card, ProgressRing, Screen, SectionHeader, Sheet } from '../components/ui';
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
  const [addMenu, setAddMenu] = useState(false);
  const [oneOff, setOneOff] = useState<{ habit: Habit | null } | null>(null);
  const [actions, setActions] = useState<ActionTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);
  if (!data) return null;
  const { habits, idx, today, settings, badHabits, relapses, dayMeta, points } = data;
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
  const { required, extras, oneOff: dayOnly } = habitsForDay(habits.filter((h) => h.lifecycle !== 'archived'), date);
  const list = required.filter((h) => showsOnDay(h, date));
  const night = nightInfo(settings, date);
  const comeback = isToday && missedYesterday(habits, idx, today);
  const activeBad = badHabits.filter((b) => b.lifecycle === 'active');
  const extrasDone = [...extras, ...dayOnly].filter((h) => isDoneStatus(idx.status(h.id, date))).length;
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
        <div className="flex flex-col items-end gap-1">
          <LevelChip level={points.level} total={points.total} />
          <div className="flex -mr-2">
            <Link to={`/calendario?v=mes&d=${date}`} className="icon-btn" aria-label="Calendario">
              <CalendarDays size={20} />
            </Link>
            <button className="icon-btn" aria-label="Día anterior" onClick={() => go(-1)}>
              <ChevronLeft size={22} />
            </button>
            <button className="icon-btn disabled:opacity-25" aria-label="Día siguiente" disabled={isToday} onClick={() => go(1)}>
              <ChevronRight size={22} />
            </button>
          </div>
        </div>
      }
    >
      {!isToday && (
        <button onClick={() => setParams({}, { replace: true })} className="w-full card2 px-4 py-2.5 text-[0.8125rem] text-blue-text text-left">
          Estás editando un día pasado. Toca aquí para volver a hoy.
        </button>
      )}

      {isToday && <GreetingCard />}

      <Card>
        <div className="flex items-center gap-4">
          <ProgressRing pct={progress.pct}>
            <span className="text-xl font-bold">{progress.total ? `${progress.pct}%` : '—'}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">
              {progress.done} de {progress.total} hábitos
            </p>
            <p className="text-[0.8125rem] text-muted mt-0.5 line-clamp-2">{missingText}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-[0.8125rem]">
              <span className="flex items-center gap-1 text-violet-text">
                <Flame size={15} /> {streak} {streak === 1 ? 'día' : 'días'} de racha
              </span>
              {extrasDone > 0 && <span className="text-blue-text">+{extrasDone} extra</span>}
              {date >= settings.pointsStartDate && <DayPointsChip day={points.byDate.get(date)} isToday={isToday} />}
            </div>
          </div>
        </div>
      </Card>

      {((!isToday && progress.missing.length > 0) || data.jokers.some((j) => j.date === date)) && <JokerRow date={date} />}

      {needBackup && (
        <Link to="/ajustes#respaldo" className="card2 px-4 py-3 flex items-center gap-3 text-[0.8125rem]">
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
            <p className="text-[0.875rem] opacity-90">
              Mañana entras a las {formatTime(night.nextStart!)}. Acuéstate a las {formatTime(night.bedtime)}.
            </p>
          </div>
        </div>
      )}

      {isToday && <DebtsCard />}

      {isToday && <WindowCard />}
      {isToday && <QuickActions />}

      {comeback && (
        <div className="card p-4 flex gap-3 border-violet/40">
          <RotateCcw size={20} className="text-violet-text shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{BRAND.comebackTitle}</p>
            <p className="text-[0.8125rem] text-muted">{BRAND.comebackBody}</p>
          </div>
        </div>
      )}

      {isSunday && isToday && (
        <Link to="/revision" className="card p-4 flex items-center gap-3 active:scale-[0.99] transition">
          <ClipboardList size={20} className="text-blue-text" />
          <div className="flex-1">
            <p className="font-semibold">Revisión semanal</p>
            <p className="text-[0.8125rem] text-muted">Cinco minutos para mirar tu semana.</p>
          </div>
          <ChevronRight size={18} className="text-dim" />
        </Link>
      )}

      <SectionHeader
        title="Hábitos de hoy"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHeavyDay(date, !heavy)}
              className={`${heavy ? 'chip-on' : 'chip-off'} gap-1.5`}
              aria-pressed={heavy}
            >
              <Feather size={14} /> Modo día pesado
            </button>
            <button
              onClick={() => setAddMenu(true)}
              className="w-11 h-11 rounded-full bg-violet text-white flex items-center justify-center active:scale-95 transition shrink-0"
              aria-label="Agregar hábito"
            >
              <Plus size={20} />
            </button>
          </div>
        }
      />
      {heavy && <p className="text-[0.8125rem] text-blue-text px-1 -mt-1">{BRAND.heavyDayBody}</p>}
      <div className="space-y-2.5">
        {list.length === 0 && <p className="text-sm text-muted px-1">No hay hábitos programados para este día.</p>}
        {list.map((h) => (
          <HabitRow key={h.id} habit={h} date={date} today={today} idx={idx} settings={settings} heavy={heavy} onOpen={() => setActions({ kind: 'good', habit: h })} />
        ))}
      </div>

      {(extras.length > 0 || dayOnly.length > 0) && (
        <>
          <SectionHeader title="Extras" right={extrasDone > 0 ? <span className="text-[0.8125rem] text-blue-text">+{extrasDone} extra</span> : undefined} />
          <div className="space-y-2.5">
            {extras.map((h) => (
              <HabitRow key={h.id} habit={h} date={date} today={today} idx={idx} settings={settings} heavy={false} onOpen={() => setActions({ kind: 'good', habit: h })} />
            ))}
            {dayOnly.map((h) => (
              <HabitRow
                key={h.id} habit={h} date={date} today={today} idx={idx} settings={settings} heavy={false}
                onOpen={() => setOneOff({ habit: h })}
              />
            ))}
          </div>
        </>
      )}

      {activeBad.length > 0 && (
        <>
          <SectionHeader title="Hábitos malos" right={<Link to="/habitos?tab=malos" className="text-[0.8125rem] text-violet-text min-h-[44px] min-w-[44px] justify-end flex items-center">Ver</Link>} />
          <div className="grid grid-cols-2 gap-2.5">
            {activeBad.map((b) => (
              <BadMini
                key={b.id}
                bad={b}
                days={badHabitStats(b, relapses, today).current}
                usage={isLimitHabit(b) ? usageOn(b, data.usageLogs, date) : undefined}
                onOpen={() => setActions({ kind: 'bad', bad: b })}
              />
            ))}
          </div>
          {isToday && new Date().getHours() >= 19 &&
            activeBad.filter((b) => isLimitHabit(b) && usageOn(b, data.usageLogs, today) === undefined).map((b) => (
              <div key={b.id} className="card p-3.5">
                <p className="text-[0.875rem] font-medium mb-2">¿Cuántos minutos de {b.name.toLowerCase()} hoy?</p>
                <UsageEntry bad={b} compact />
              </div>
            ))}
        </>
      )}

      <DayStatusSheet habit={open} date={date} idx={idx} onClose={() => setOpen(null)} />

      <HabitActionsSheet
        target={actions}
        onClose={() => setActions(null)}
        onDayRecord={(h) => setOpen(h)}
        onDone={setToast}
      />

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 z-50 flex justify-center px-4 animate-fadeUp pointer-events-none"
          style={{ bottom: 'calc(76px + var(--safe-bottom))' }}
        >
          <p className="max-w-[440px] rounded-2xl bg-card2 border border-line2 px-4 py-3 text-[0.8125rem] shadow-lg">{toast}</p>
        </div>
      )}

      <Sheet open={addMenu} onClose={() => setAddMenu(false)} title="Agregar">
        <div className="space-y-2">
          <button
            className="w-full card2 p-4 flex items-center gap-3 text-left active:scale-[0.99] transition"
            onClick={() => { setAddMenu(false); nav('/habitos/nuevo'); }}
          >
            <span className="w-10 h-10 rounded-xl bg-violet-soft text-violet-text flex items-center justify-center shrink-0"><Repeat size={19} /></span>
            <span>
              <span className="block font-medium">Hábito nuevo</span>
              <span className="block text-[0.75rem] text-muted">Se repite según su frecuencia</span>
            </span>
          </button>
          <button
            className="w-full card2 p-4 flex items-center gap-3 text-left active:scale-[0.99] transition"
            onClick={() => { setAddMenu(false); setOneOff({ habit: null }); }}
          >
            <span className="w-10 h-10 rounded-xl bg-blue-soft text-blue-text flex items-center justify-center shrink-0"><CalendarPlus size={19} /></span>
            <span>
              <span className="block font-medium">Solo para hoy</span>
              <span className="block text-[0.75rem] text-muted">
                {isToday ? 'Solo aparece hoy' : `Solo aparece el ${formatLong(date).toLowerCase()}`} · cuenta como extra
              </span>
            </span>
          </button>
        </div>
      </Sheet>

      <OneOffSheet open={!!oneOff} date={date} habit={oneOff?.habit} onClose={() => setOneOff(null)} />
    </Screen>
  );
}

/** "Días sin" card: tap or long-press opens the actions menu. */
function BadMini({ bad, days, usage, onOpen }: { bad: BadHabit; days: number; usage?: number; onOpen: () => void }) {
  const press = useLongPress(onOpen);
  return (
    <button className="card p-3.5 text-left active:scale-[0.98] transition" aria-label={`Opciones de ${bad.name}`} aria-haspopup="dialog" {...press}>
      <span className="flex items-center gap-2 text-muted text-[0.75rem]">
        <HabitIcon name={bad.icon} size={14} />
        <span className="truncate">{bad.name}</span>
      </span>
      {isLimitHabit(bad) ? (
        <span className="block text-2xl font-bold mt-1">
          {usage ?? '—'}
          <span className="text-[0.8125rem] font-medium text-muted"> / {limitOf(bad)} min</span>
        </span>
      ) : (
        <span className="block text-2xl font-bold mt-1">
          {days}
          <span className="text-[0.8125rem] font-medium text-muted"> {days === 1 ? 'día' : 'días'}</span>
        </span>
      )}
    </button>
  );
}
