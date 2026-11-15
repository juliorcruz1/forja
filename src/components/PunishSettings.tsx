import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { updateSettings } from '../db/repo';
import type { PunishChoice, PunishType } from '../db/types';
import { PUNISH_HINT, PUNISH_LABEL, unsafePunishText } from '../domain/punish';
import { useData } from '../hooks/useData';
import { formatLong, isValidKey } from '../lib/dates';
import { NumberField } from './SettingsStage2';
import { Card, Toggle } from './ui';

const TYPES: PunishType[] = ['habitDebt', 'firstThings', 'task', 'jar'];

/** Ajustes → "Castigos y frasco" + paper size for the weekly print. */
export function PunishSettings() {
  const { settings, today } = useData()!;
  const p = settings.punish;
  const set = (patch: Partial<typeof p>) => updateSettings({ punish: { ...p, ...patch } });
  const [extra, setExtra] = useState(p.habitDebtExtra);
  const [extraError, setExtraError] = useState<string | null>(null);
  useEffect(() => setExtra(p.habitDebtExtra), [p.habitDebtExtra]);

  const toggleType = (t: PunishType) => {
    const types = p.types.includes(t) ? p.types.filter((x) => x !== t) : [...p.types, t];
    const defaultType = types.includes(p.defaultType) ? p.defaultType : types[0] ?? p.defaultType;
    set({ types, defaultType });
  };

  return (
    <Card>
      <div id="castigos" className="scroll-mt-4" />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Castigos</p>
          <p className="text-[0.75rem] text-muted">Consecuencias suaves que tú eliges. De honor: nada se bloquea.</p>
        </div>
        <Toggle checked={p.enabled} onChange={(v) => set({ enabled: v })} label="Castigos activos" />
      </div>

      {p.enabled && (
        <>
          <label className="block mt-4">
            <span className="label">Contar fallos desde</span>
            <input
              type="date"
              className="field"
              value={p.startDate}
              max={today}
              onChange={(e) => isValidKey(e.target.value) && set({ startDate: e.target.value })}
            />
          </label>
          <p className="text-[0.75rem] text-dim mt-1.5">
            Los días antes del {formatLong(p.startDate).toLowerCase()} nunca generan castigo.
          </p>

          <p className="text-[0.75rem] font-semibold text-muted mt-4 mb-1.5">Tipos que aceptas</p>
          <div className="space-y-2">
            {TYPES.map((t) => (
              <div key={t} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[0.875rem]">{PUNISH_LABEL[t]}</p>
                  <p className="text-[0.75rem] text-muted">{PUNISH_HINT[t]}</p>
                </div>
                <Toggle checked={p.types.includes(t)} onChange={() => toggleType(t)} label={`Aceptar ${PUNISH_LABEL[t]}`} />
              </div>
            ))}
          </div>

          {p.types.length > 0 && (
            <>
              <p className="text-[0.75rem] font-semibold text-muted mt-4 mb-1.5">Tipo por defecto</p>
              <div className="flex flex-wrap gap-2">
                {p.types.map((t) => (
                  <button key={t} className={p.defaultType === t ? 'chip-on' : 'chip-off'} aria-pressed={p.defaultType === t} onClick={() => set({ defaultType: t })}>
                    {PUNISH_LABEL[t]}
                  </button>
                ))}
              </div>
              <p className="text-[0.75rem] text-dim mt-1.5">Cada hábito puede tener el suyo (Editar hábito → Castigo).</p>
            </>
          )}

          <label className="block mt-4">
            <span className="label">Extra de la deuda del hábito</span>
            <input
              className="field"
              value={extra}
              maxLength={50}
              placeholder="Ej. 10 flexiones más"
              onChange={(e) => { setExtra(e.target.value); setExtraError(null); }}
              onBlur={() => {
                const err = unsafePunishText(extra);
                if (err) return setExtraError(err);
                if (extra.trim() !== p.habitDebtExtra) set({ habitDebtExtra: extra.trim() });
              }}
            />
          </label>
          {extraError && <p className="text-[0.8125rem] text-blue-text mt-1.5">{extraError}</p>}

          <NumberField label="Monto del frasco por castigo" value={p.jarAmount} min={0} max={10000} onSave={(n) => set({ jarAmount: n })} />
          <label className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-[0.875rem] text-muted flex-1">Símbolo de moneda</span>
            <input className="field w-[5.5rem] py-2 text-center" value={p.currency} maxLength={4} onChange={(e) => set({ currency: e.target.value })} />
          </label>
          <Link to="/castigos#tareas" className="text-[0.875rem] text-violet-text inline-flex items-center min-h-[44px]">
            Tareas pendientes para sortear ({p.tasks.length})
          </Link>
        </>
      )}

      <p className="text-[0.75rem] font-semibold text-muted mt-4 mb-1.5">Tamaño de hoja para imprimir</p>
      <div className="flex gap-2">
        {(['letter', 'a4'] as const).map((s) => (
          <button key={s} className={settings.paperSize === s ? 'chip-on' : 'chip-off'} aria-pressed={settings.paperSize === s} onClick={() => updateSettings({ paperSize: s })}>
            {s === 'letter' ? 'Carta' : 'A4'}
          </button>
        ))}
      </div>
    </Card>
  );
}

/** Picker used in the habit forms: default / a type / none. */
export function PunishPicker({ value, onChange }: { value: PunishChoice | undefined; onChange: (v: PunishChoice | undefined) => void }) {
  const { settings } = useData()!;
  const p = settings.punish;
  const opts: { v: PunishChoice | undefined; label: string }[] = [
    { v: undefined, label: `Por defecto (${PUNISH_LABEL[p.defaultType]})` },
    ...p.types.filter((t) => t !== p.defaultType).map((t) => ({ v: t as PunishChoice, label: PUNISH_LABEL[t] })),
    { v: 'none', label: 'Sin castigo' },
  ];
  return (
    <div>
      <p className="label">Castigo si fallo</p>
      {!p.enabled ? (
        <p className="text-[0.75rem] text-dim">Los castigos están apagados en Ajustes.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {opts.map((o) => (
            <button key={o.label} type="button" className={value === o.v ? 'chip-on' : 'chip-off'} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
