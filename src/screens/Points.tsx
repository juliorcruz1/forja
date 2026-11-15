import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LevelBar } from '../components/PointsBits';
import { Card, Screen, SectionHeader } from '../components/ui';
import type { DayPoints } from '../domain/points';
import { formatPts, summarize } from '../domain/points';
import { useData } from '../hooks/useData';
import { addDays, addMonths, formatLong, monthStart, weekStart } from '../lib/dates';

export function PointsScreen() {
  const data = useData();
  if (!data) return null;
  const { points, today, settings } = data;
  const P = settings.points;
  const week = summarize(points, weekStart(today), today);
  const month = summarize(points, monthStart(today), addDays(addMonths(monthStart(today), 1), -1));
  const recent = [...points.days].reverse().slice(1, 15);

  return (
    <Screen title="Puntos" subtitle="Tu constancia" back>
      <Card>
        <p className="text-[0.8125rem] text-muted">Acumulado</p>
        <p className="text-[2.75rem] leading-none font-bold tracking-tight mt-1">{formatPts(points.total)}</p>
        <div className="mt-4">
          <LevelBar level={points.level} maxTotal={points.maxTotal} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3.5">
        <Card>
          <p className="text-[0.75rem] text-muted">Esta semana</p>
          <p className="text-2xl font-bold mt-1">{week.net >= 0 ? '+' : ''}{formatPts(week.net)}</p>
        </Card>
        <Card>
          <p className="text-[0.75rem] text-muted">Este mes</p>
          <p className="text-2xl font-bold mt-1">{month.net >= 0 ? '+' : ''}{formatPts(month.net)}</p>
        </Card>
      </div>

      <SectionHeader title="Hoy" />
      {points.today ? (
        <DayCard day={points.today} open />
      ) : (
        <Card><p className="text-sm text-muted">Los puntos empiezan a contar el {formatLong(settings.pointsStartDate).toLowerCase()}.</p></Card>
      )}

      {recent.length > 0 && (
        <>
          <SectionHeader title="Días anteriores" />
          <div className="space-y-2">
            {recent.map((d) => <DayCard key={d.date} day={d} />)}
          </div>
        </>
      )}

      <SectionHeader title="Cómo se ganan" />
      <Card>
        <ul className="text-[0.8125rem] space-y-1.5">
          <Rule label="Hábito completo / mínimo" value={`+${P.done} / +${P.min}`} />
          <Rule label="Extra (opcional)" value={`+${P.extra}`} />
          <Rule label="Meta de contador (hidratación)" value={`+${P.hydration}`} />
          <Rule label="Día perfecto" value={`+${P.perfectDay}`} />
          <Rule label="Meta semanal cumplida" value={`+${P.weeklyGoal}`} />
          <Rule label="Racha 7 / 14 / 30 días" value={`+${P.streak7} / +${P.streak14} / +${P.streak30}`} />
          <Rule label="Día sin caer (hábito malo)" value={`+${P.badCleanDay}`} />
          <Rule label="Redes dentro del límite" value={`+${P.socialWithin}`} />
          <Rule label="Ventana sin celular cumplida" value={`+${P.windowKept}`} />
          <Rule label={`Sesión de concentración (máx. ${P.focusMaxPerDay} al día)`} value={`+${P.focusSession}`} />
          <Rule label="Resististe unas ganas" value={`+${P.resisted}`} />
        </ul>
        <p className="text-[0.75rem] font-semibold text-muted mt-4 mb-1.5">Restas suaves (al cerrar el día)</p>
        <ul className="text-[0.8125rem] space-y-1.5">
          <Rule label="Hábito obligatorio sin cumplir" value={`−${P.missed}`} />
          <Rule label="Redes sobre el límite" value={`−${P.socialOver}`} />
          <Rule label="Tope por día de las dos anteriores" value={`−${P.dailyPenaltyCap}`} />
          <Rule label="Recaída" value={`−${P.relapse}`} />
          <Rule label="Meta semanal: por cada día que faltó" value={`−${P.weeklyMissPerDay}`} />
        </ul>
        <p className="text-[0.75rem] text-dim mt-3">
          Nunca restan: días de descanso, días no programados, opcionales, días con modo día pesado ni versiones mínimas.
          Tienes 1 comodín por semana para perdonar un día. El total no baja de 0 y tu nivel nunca baja.
        </p>
        <Link to="/ajustes#puntos" className="text-[0.8125rem] text-violet-text inline-flex min-h-[44px] items-center">Cambiar valores en Ajustes</Link>
      </Card>
    </Screen>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium shrink-0">{value}</span>
    </li>
  );
}

function DayCard({ day, open: initial = false }: { day: DayPoints; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="card overflow-hidden">
      <button className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="flex-1 min-w-0">
          <span className="block text-[0.875rem] font-medium">{formatLong(day.date)}</span>
          <span className="block text-[0.75rem] text-muted">
            {day.provisional ? 'Provisional · las restas se aplican al cerrar el día' : `+${day.gain} / −${day.loss}`}
            {day.waived === 'joker' ? ' · comodín' : day.waived === 'heavy' ? ' · día pesado' : ''}
          </span>
        </span>
        <span className={`text-lg font-bold ${day.net >= 0 ? 'text-violet-text' : 'text-muted'}`}>
          {day.net >= 0 ? '+' : ''}{day.net}
        </span>
        {open ? <ChevronUp size={18} className="text-dim" /> : <ChevronDown size={18} className="text-dim" />}
      </button>
      {open && (
        <ul className="px-4 pb-3 space-y-1 border-t border-line pt-2">
          {day.items.length === 0 && <li className="text-[0.8125rem] text-dim">Sin movimientos todavía.</li>}
          {day.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-3 text-[0.8125rem]">
              <span className="text-muted truncate">{i.label}</span>
              <span className={i.pts >= 0 ? 'text-violet-text' : 'text-muted'}>{i.pts >= 0 ? '+' : '−'}{Math.abs(i.pts)}</span>
            </li>
          ))}
          {day.cappedOff > 0 && <li className="text-[0.75rem] text-dim">Tope diario aplicado: se perdonaron {day.cappedOff} pts.</li>}
        </ul>
      )}
    </div>
  );
}
