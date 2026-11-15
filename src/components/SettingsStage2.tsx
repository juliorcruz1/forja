/** Ajustes sections added in Stage 2. */
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_LEVELS, DEFAULT_POINTS } from '../config/defaults';
import { updateSettings } from '../db/repo';
import type { PointValues } from '../db/types';
import { useData } from '../hooks/useData';
import { formatLong, isValidKey } from '../lib/dates';
import { Card } from './ui';

/** Integer input that saves on blur (or Enter). */
export function NumberField({
  value, onSave, min = 0, max = 9999, label, suffix,
}: { value: number; onSave: (n: number) => void; min?: number; max?: number; label: string; suffix?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= min && n <= max) {
      if (n !== value) onSave(n);
    } else setV(String(value));
  };
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[14px] text-muted flex-1">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          className="field w-[84px] py-2 text-center"
          value={v}
          min={min}
          max={max}
          aria-label={label}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {suffix && <span className="text-[12px] text-dim w-7">{suffix}</span>}
      </span>
    </label>
  );
}

const GAIN_FIELDS: [keyof PointValues, string][] = [
  ['done', 'Hábito completo'],
  ['min', 'Versión mínima'],
  ['extra', 'Extra (opcional)'],
  ['hydration', 'Meta de contador (hidratación)'],
  ['perfectDay', 'Día perfecto'],
  ['weeklyGoal', 'Meta semanal cumplida'],
  ['streak7', 'Racha de 7 días'],
  ['streak14', 'Racha de 14 días'],
  ['streak30', 'Racha de 30 días'],
  ['badCleanDay', 'Día sin caer (hábito malo)'],
  ['socialWithin', 'Redes dentro del límite'],
  ['windowKept', 'Ventana sin celular cumplida'],
  ['focusSession', 'Sesión de concentración'],
  ['focusMaxPerDay', 'Sesiones con puntos por día'],
  ['resisted', 'Resistí (momento de ganas)'],
];

const LOSS_FIELDS: [keyof PointValues, string][] = [
  ['missed', 'Hábito obligatorio sin cumplir'],
  ['socialOver', 'Redes sobre el límite'],
  ['dailyPenaltyCap', 'Tope de restas por día'],
  ['relapse', 'Recaída'],
  ['weeklyMissPerDay', 'Meta semanal: por día faltante'],
];

export function PointsSettings() {
  const { settings, today } = useData()!;
  const P = settings.points;
  const setP = (k: keyof PointValues, n: number) => updateSettings({ points: { ...P, [k]: n } });
  const levels = [...settings.levels].sort((a, b) => a.min - b.min);

  return (
    <Card>
      <div id="puntos" className="scroll-mt-4" />
      <p className="font-semibold mb-1">Puntos y niveles</p>
      <p className="text-[12px] text-muted mb-3">
        Los puntos se calculan con tus registros: si cambias un valor, todo se recalcula solo.
      </p>

      <label className="block">
        <span className="label">Contar puntos desde</span>
        <input
          type="date"
          className="field"
          value={settings.pointsStartDate}
          max={today}
          onChange={(e) => isValidKey(e.target.value) && updateSettings({ pointsStartDate: e.target.value })}
        />
      </label>
      <p className="text-[12px] text-dim mt-1.5 mb-3">
        Los días anteriores al {formatLong(settings.pointsStartDate).toLowerCase()} no suman ni restan.
      </p>

      <p className="text-[12px] font-semibold text-muted mt-2">Suman</p>
      <div className="divide-y divide-line">
        {GAIN_FIELDS.map(([k, label]) => (
          <NumberField key={k} label={label} value={P[k]} onSave={(n) => setP(k, n)} suffix={k === 'focusMaxPerDay' ? '' : 'pts'} />
        ))}
      </div>
      <p className="text-[12px] font-semibold text-muted mt-4">Restan (al cerrar el día)</p>
      <div className="divide-y divide-line">
        {LOSS_FIELDS.map(([k, label]) => (
          <NumberField key={k} label={label} value={P[k]} onSave={(n) => setP(k, n)} suffix="pts" />
        ))}
      </div>

      <p className="text-[12px] font-semibold text-muted mt-4 mb-1">Niveles (puntos para llegar)</p>
      <div className="divide-y divide-line">
        {levels.map((l, i) => (
          <NumberField
            key={l.name}
            label={l.name}
            value={l.min}
            min={0}
            max={1000000}
            suffix="pts"
            onSave={(n) => {
              if (i === 0) return; // the first level always starts at 0
              updateSettings({ levels: levels.map((x) => (x.name === l.name ? { ...x, min: n } : x)) });
            }}
          />
        ))}
      </div>
      <button
        className="pill-ghost w-full mt-4"
        onClick={() => updateSettings({ points: DEFAULT_POINTS, levels: DEFAULT_LEVELS })}
      >
        <RotateCcw size={15} /> Restaurar valores sugeridos
      </button>
    </Card>
  );
}
