/** Ajustes sections added in Stage 2. */
import { Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DEFAULT_LEVELS, DEFAULT_POINTS } from '../config/defaults';
import { saveBadHabit, updateSettings } from '../db/repo';
import type { PointValues } from '../db/types';
import { useData } from '../hooks/useData';
import { formatLong, isValidKey, WEEKDAY_NAMES } from '../lib/dates';
import { Card, Toggle } from './ui';

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

/** Phone & social: social limit, phone-free windows, wake-up times, urge replacements. */
export function PhoneSettings() {
  const { settings, badHabits } = useData()!;
  const np = settings.noPhone;
  const limits = badHabits.filter((b) => b.mode === 'limit' && b.lifecycle !== 'archived');
  const [newRep, setNewRep] = useState('');
  const reps = settings.replacements;

  return (
    <Card>
      <div id="celular" className="scroll-mt-4" />
      <p className="font-semibold mb-1">Celular y redes</p>
      <p className="text-[12px] text-muted mb-3">
        FORJA no puede bloquear apps ni leer el Tiempo en pantalla. Registra, te recuerda y te da un momento de pausa;
        el bloqueo real lo configuras en el iPhone (Tiempo en pantalla y Modos de concentración).
      </p>

      {limits.map((b) => (
        <NumberField
          key={b.id}
          label={`Límite diario de ${b.name}`}
          value={b.limitMinutes ?? 60}
          min={1}
          max={1440}
          suffix="min"
          onSave={(n) => saveBadHabit({ ...b, limitMinutes: n })}
        />
      ))}

      <p className="text-[12px] font-semibold text-muted mt-4">Ventanas sin celular</p>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-[14px] text-muted">Al despertar</span>
        <Toggle checked={np.morningEnabled} onChange={(v) => updateSettings({ noPhone: { ...np, morningEnabled: v } })} label="Ventana al despertar" />
      </div>
      {np.morningEnabled && (
        <NumberField label="Duración al despertar" value={np.morningMinutes} min={5} max={240} suffix="min"
          onSave={(n) => updateSettings({ noPhone: { ...np, morningMinutes: n } })} />
      )}
      <div className="flex items-center justify-between py-1.5">
        <span className="text-[14px] text-muted">Antes de dormir</span>
        <Toggle checked={np.nightEnabled} onChange={(v) => updateSettings({ noPhone: { ...np, nightEnabled: v } })} label="Ventana antes de dormir" />
      </div>
      {np.nightEnabled && (
        <NumberField label="Duración antes de dormir" value={np.nightMinutes} min={5} max={240} suffix="min"
          onSave={(n) => updateSettings({ noPhone: { ...np, nightMinutes: n } })} />
      )}
      <p className="text-[12px] text-dim mt-1">
        La ventana de la noche termina a tu hora de acostarte de ese día (más temprano en noches críticas).
      </p>

      <p className="text-[12px] font-semibold text-muted mt-4 mb-1">Hora de despertar</p>
      <div className="divide-y divide-line">
        {settings.wakeTime.map((w, i) => (
          <label key={i} className="flex items-center justify-between py-1.5 gap-3">
            <span className="text-[14px] text-muted capitalize">{WEEKDAY_NAMES[i]}</span>
            <input
              type="time"
              className="field w-[150px] py-2 text-center"
              value={w}
              onChange={(e) => e.target.value && updateSettings({ wakeTime: settings.wakeTime.map((x, j) => (j === i ? e.target.value : x)) })}
            />
          </label>
        ))}
      </div>

      <div id="reemplazos" className="scroll-mt-4" />
      <p className="text-[12px] font-semibold text-muted mt-4 mb-1">Reemplazos rápidos (Momento de ganas)</p>
      <ul className="space-y-1.5">
        {reps.map((r, i) => (
          <li key={`${r}-${i}`} className="flex items-center gap-2">
            <span className="flex-1 text-[14px]">{r}</span>
            <button
              className="icon-btn"
              aria-label={`Quitar ${r}`}
              onClick={() => updateSettings({ replacements: reps.filter((_, j) => j !== i) })}
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 mt-2">
        <input
          className="field"
          placeholder="Ej. Estirarme 2 minutos"
          value={newRep}
          onChange={(e) => setNewRep(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newRep.trim()) {
              updateSettings({ replacements: [...reps, newRep.trim()] });
              setNewRep('');
            }
          }}
        />
        <button
          className="pill-ghost shrink-0"
          disabled={!newRep.trim()}
          onClick={() => {
            updateSettings({ replacements: [...reps, newRep.trim()] });
            setNewRep('');
          }}
        >
          <Plus size={16} /> Agregar
        </button>
      </div>
    </Card>
  );
}
