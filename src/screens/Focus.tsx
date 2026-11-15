import { Smartphone, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, Screen, SectionHeader } from '../components/ui';
import { DEFAULT_FOCUS_LABEL, FOCUS_DURATIONS } from '../config/defaults';
import { cancelFocus, settleFocus, startFocus } from '../db/repo';
import { focusTotals, formatClock, formatMinutes, plannedEnd, remainingMs, runningSession } from '../domain/focus';
import { useData } from '../hooks/useData';
import { useNow } from '../hooks/useNow';
import { useWakeLock } from '../hooks/useWakeLock';
import { formatShort, weekStart } from '../lib/dates';

export function FocusScreen() {
  const data = useData();
  const now = useNow(1000);
  const [minutes, setMinutes] = useState(25);
  const [label, setLabel] = useState(DEFAULT_FOCUS_LABEL);
  const [justDone, setJustDone] = useState(false);
  const running = data ? runningSession(data.focusSessions, now) : undefined;
  useWakeLock(!!running);

  // When the planned end passes while this screen is open, close the session as done.
  const expired = !!data?.focusSessions.some((s) => s.status === 'running' && remainingMs(s, now) === 0);
  useEffect(() => {
    if (!expired) return;
    settleFocus().then((n) => {
      if (n > 0) {
        setJustDone(true);
        navigator.vibrate?.([200, 100, 200]);
      }
    });
  }, [expired]);

  if (!data) return null;
  const { focusSessions, today, settings } = data;
  const day = focusTotals(focusSessions, today, today);
  const week = focusTotals(focusSessions, weekStart(today), today);
  const P = settings.points;
  const labels = [
    ...new Set([DEFAULT_FOCUS_LABEL, ...data.habits.filter((h) => h.lifecycle === 'active' && !h.oneOffDate).map((h) => h.name)]),
  ].slice(0, 6);
  const recent = focusSessions
    .filter((s) => s.status !== 'running')
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
    .slice(0, 8);
  const endTime = (iso: number) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

  return (
    <Screen title="Concentración" back>
      {running ? (
        <Card className="text-center py-8">
          <p className="text-[0.8125rem] text-muted">
            {running.label} · {running.plannedMin} min
          </p>
          <p className="text-[4.5rem] leading-none font-bold tracking-tight tabular-nums mt-3" aria-label="Tiempo restante">
            {formatClock(remainingMs(running, now))}
          </p>
          <p className="text-[0.8125rem] text-night-text mt-4 flex items-center justify-center gap-2">
            <Smartphone size={15} /> Deja el celular boca abajo y lejos.
          </p>
          <p className="text-[0.75rem] text-dim mt-1">
            Termina a las {endTime(plannedEnd(running))}. Si cierras la app, el tiempo sigue contando.
          </p>
          <button className="pill-ghost w-full mt-6" onClick={() => cancelFocus(running.id)}>
            Cancelar
          </button>
          <p className="text-[0.6875rem] text-dim mt-2">Cancelar no resta puntos; solo no cuenta.</p>
        </Card>
      ) : (
        <Card>
          {justDone && (
            <p className="rounded-xl bg-violet-soft text-violet-text text-[0.875rem] font-medium px-3 py-2 mb-4" role="status">
              ¡Sesión completa!{' '}
              {day.sessions <= P.focusMaxPerDay ? `+${P.focusSession} pts` : 'Ya sumaste el máximo de hoy, pero el tiempo cuenta.'}
            </p>
          )}
          <p className="label">Duración</p>
          <div className="flex gap-2">
            {FOCUS_DURATIONS.map((m) => (
              <button
                key={m}
                className={`flex-1 justify-center min-h-[44px] ${minutes === m ? 'chip-on' : 'chip-off'}`}
                aria-pressed={minutes === m}
                onClick={() => setMinutes(m)}
              >
                {m} min
              </button>
            ))}
          </div>
          <label className="label mt-4" htmlFor="focus-label">
            ¿En qué vas a trabajar?
          </label>
          <input id="focus-label" className="field" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          <div className="flex gap-2 flex-wrap mt-2">
            {labels.map((l) => (
              <button key={l} className={label === l ? 'chip-on' : 'chip-off'} onClick={() => setLabel(l)}>
                {l}
              </button>
            ))}
          </div>
          <p className="text-[0.8125rem] text-muted mt-4 flex items-center gap-2">
            <Smartphone size={15} /> Antes de empezar: celular boca abajo y en No molestar.
          </p>
          <button
            className="pill-primary w-full mt-4"
            onClick={() => {
              setJustDone(false);
              startFocus(label, minutes);
            }}
          >
            <Timer size={17} /> Iniciar
          </button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3.5">
        <Card>
          <p className="text-[0.75rem] text-muted">Hoy</p>
          <p className="text-2xl font-bold mt-1">{formatMinutes(day.minutes)}</p>
          <p className="text-[0.6875rem] text-dim">
            {day.sessions} {day.sessions === 1 ? 'sesión' : 'sesiones'} · máx. {P.focusMaxPerDay} con puntos
          </p>
        </Card>
        <Card>
          <p className="text-[0.75rem] text-muted">Esta semana</p>
          <p className="text-2xl font-bold mt-1">{formatMinutes(week.minutes)}</p>
          <p className="text-[0.6875rem] text-dim">
            {week.sessions} {week.sessions === 1 ? 'sesión' : 'sesiones'}
          </p>
        </Card>
      </div>

      {recent.length > 0 && (
        <>
          <SectionHeader title="Sesiones recientes" />
          <div className="card divide-y divide-line">
            {recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 min-h-[48px] text-[0.875rem]">
                <span className="min-w-0 truncate">{s.label}</span>
                <span className="text-muted text-[0.75rem] shrink-0">
                  {formatShort(s.date)} · {s.status === 'done' ? `${s.plannedMin} min` : 'cancelada'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[0.6875rem] text-dim px-1">
        En iPhone los temporizadores no corren en segundo plano: FORJA calcula el tiempo con la hora de inicio y la de fin, y
        lo recalcula al volver a abrir la app.
      </p>
    </Screen>
  );
}
