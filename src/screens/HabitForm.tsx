import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HABIT_ICONS, HabitIcon } from '../components/icons';
import { Card, Screen, Sheet, Toggle } from '../components/ui';
import type { ChecklistItem, Frequency, Habit, HabitKind, Weekday } from '../db/types';
import {
  archiveHabit, deleteHabit, moveHabit, pauseHabit, resumeHabit, saveHabit, unarchiveHabit,
} from '../db/repo';
import { useData } from '../hooks/useData';
import { WEEKDAY_LETTER } from '../lib/dates';
import {
  addItem, cleanItems, moveItem, removeItem, TIMES_OF_DAY, timeLabel, updateItem,
} from '../domain/checklist';

type FreqType = Frequency['type'];

interface FormState {
  name: string;
  icon: string;
  kind: HabitKind;
  freqType: FreqType;
  days: Weekday[];
  target: number;
  plannedDays: Weekday[];
  minVersion: string;
  identity: string;
  stackAfter: string;
  required: boolean;
  counterTarget: number;
  counterUnit: string;
  checklist: ChecklistItem[];
  sleepLinked: boolean;
}

const EMPTY: FormState = {
  name: '', icon: 'target', kind: 'check', freqType: 'daily', days: [0, 1, 2, 3, 4], target: 3, plannedDays: [],
  minVersion: '', identity: '', stackAfter: '', required: true, counterTarget: 1, counterUnit: '', checklist: [], sleepLinked: false,
};

function fromHabit(h: Habit): FormState {
  const f = h.frequency;
  return {
    name: h.name,
    icon: h.icon,
    kind: h.kind,
    freqType: f.type,
    days: f.type === 'days' ? f.days : EMPTY.days,
    target: f.type === 'weekly' ? f.target : EMPTY.target,
    plannedDays: f.type === 'weekly' ? f.plannedDays : EMPTY.plannedDays,
    minVersion: h.minVersion ?? '',
    identity: h.identity ?? '',
    stackAfter: h.stackAfter ?? '',
    required: h.required,
    counterTarget: h.counterTarget ?? 1,
    counterUnit: h.counterUnit ?? '',
    checklist: h.checklist ?? [],
    sleepLinked: !!h.sleepLinked,
  };
}

export function HabitFormScreen() {
  const { id } = useParams();
  const data = useData();
  const nav = useNavigate();
  const existing = id ? data?.habits.find((h) => h.id === id) : undefined;
  const [f, setF] = useState<FormState>(EMPTY);
  const [iconOpen, setIconOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (existing && !loaded) {
      setF(fromHabit(existing));
      setLoaded(true);
    }
  }, [existing, loaded]);

  if (!data || !loaded) return null;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const toggleDay = (list: Weekday[], d: Weekday) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort());
  const otherNames = data.habits.filter((h) => h.id !== id && h.lifecycle !== 'archived' && !h.oneOffDate).map((h) => h.name);

  const valid =
    f.name.trim().length > 0 &&
    (f.freqType !== 'days' || f.days.length > 0) &&
    (f.freqType !== 'weekly' || (f.target >= 1 && f.target <= 7));
  // Blank checklist rows never block saving: they are dropped (see cleanItems).

  const save = async () => {
    if (!valid) return;
    const frequency: Frequency =
      f.freqType === 'daily'
        ? { type: 'daily' }
        : f.freqType === 'days'
          ? { type: 'days', days: f.days }
          : { type: 'weekly', target: f.target, plannedDays: f.plannedDays };
    const h = await saveHabit({
      id: existing?.id,
      name: f.name.trim(),
      icon: f.icon,
      kind: f.kind,
      frequency,
      minVersion: f.minVersion.trim() || undefined,
      identity: f.identity.trim() || undefined,
      stackAfter: f.stackAfter.trim() || undefined,
      required: f.required,
      counterTarget: f.kind === 'counter' ? Math.max(1, f.counterTarget) : undefined,
      counterUnit: f.kind === 'counter' ? f.counterUnit.trim() || undefined : undefined,
      checklist: f.kind === 'checklist' ? cleanItems(f.checklist) : undefined,
      sleepLinked: f.sleepLinked || undefined,
    });
    nav(existing ? `/habitos/${h.id}` : '/habitos', { replace: true });
  };

  return (
    <Screen title={existing ? 'Editar hábito' : 'Nuevo hábito'} back>
      <Card>
        <label className="label" htmlFor="name">Nombre</label>
        <div className="flex gap-2">
          <button
            type="button"
            className="w-[50px] h-[50px] shrink-0 rounded-xl bg-violet-soft text-violet-text flex items-center justify-center border border-line2"
            onClick={() => setIconOpen(true)}
            aria-label="Elegir ícono"
          >
            <HabitIcon name={f.icon} size={22} />
          </button>
          <input id="name" className="field" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Lectura" maxLength={40} />
        </div>

        <label className="label mt-4">Tipo de registro</label>
        <div className="flex gap-2 flex-wrap">
          {([['check', 'Sí / no'], ['counter', 'Contador'], ['checklist', 'Lista']] as const).map(([k, l]) => (
            <button key={k} className={f.kind === k ? 'chip-on' : 'chip-off'} onClick={() => set('kind', k)}>{l}</button>
          ))}
        </div>

        {f.kind === 'counter' && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="label">Meta diaria</label>
              <input type="number" inputMode="numeric" min={1} max={99} className="field" value={f.counterTarget}
                onChange={(e) => set('counterTarget', Number(e.target.value) || 1)} />
            </div>
            <div>
              <label className="label">Unidad</label>
              <input className="field" value={f.counterUnit} onChange={(e) => set('counterUnit', e.target.value)} placeholder="vasos, clips…" />
            </div>
          </div>
        )}

        {f.kind === 'checklist' && (
          <ChecklistEditor items={f.checklist} onChange={(v) => set('checklist', v)} />
        )}
      </Card>

      <Card>
        <label className="label">Frecuencia</label>
        <div className="flex gap-2 flex-wrap">
          {([['daily', 'Diario'], ['days', 'Días específicos'], ['weekly', 'Veces por semana']] as const).map(([k, l]) => (
            <button key={k} className={f.freqType === k ? 'chip-on' : 'chip-off'} onClick={() => set('freqType', k)}>{l}</button>
          ))}
        </div>
        {f.freqType === 'days' && (
          <DayPicker value={f.days} onToggle={(d) => set('days', toggleDay(f.days, d))} />
        )}
        {f.freqType === 'weekly' && (
          <>
            <label className="label mt-4">Meta por semana</label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={7} value={f.target} onChange={(e) => set('target', Number(e.target.value))} className="flex-1 accent-[#8B5CF6]" />
              <span className="w-16 text-right font-semibold">{f.target} días</span>
            </div>
            <label className="label mt-3">Días planeados (guía, se pueden mover cada semana)</label>
            <DayPicker value={f.plannedDays} onToggle={(d) => set('plannedDays', toggleDay(f.plannedDays, d))} dashed />
          </>
        )}

        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="text-[15px]">Obligatorio</p>
            <p className="text-[12px] text-muted">Si lo apagas, va a "Extras": suma como bonus y nunca cuenta como fallo.</p>
          </div>
          <Toggle checked={f.required} onChange={(v) => set('required', v)} label="Obligatorio" />
        </div>
      </Card>

      <Card>
        <label className="label" htmlFor="min">Versión mínima (para días difíciles)</label>
        <input id="min" className="field" value={f.minVersion} onChange={(e) => set('minVersion', e.target.value)} placeholder="Ej. 2 páginas" />
        <label className="label mt-4" htmlFor="identity">Frase de identidad</label>
        <input id="identity" className="field" value={f.identity} onChange={(e) => set('identity', e.target.value)} placeholder="Soy alguien que…" />
        <label className="label mt-4" htmlFor="stack">Después de… (hábito previo, opcional)</label>
        <input id="stack" className="field" list="habit-names" value={f.stackAfter} onChange={(e) => set('stackAfter', e.target.value)} placeholder="Ej. Después de cenar" />
        <datalist id="habit-names">
          {otherNames.map((n) => <option key={n} value={n} />)}
        </datalist>
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="text-[15px]">Ligado a la hora de dormir</p>
            <p className="text-[12px] text-muted">Muestra tu hora de acostarte del día.</p>
          </div>
          <Toggle checked={f.sleepLinked} onChange={(v) => set('sleepLinked', v)} label="Ligado a dormir" />
        </div>
      </Card>

      <button className="pill-primary w-full disabled:opacity-40" disabled={!valid} onClick={save}>
        {existing ? 'Guardar cambios' : 'Crear hábito'}
      </button>

      {existing && (
        <Card>
          <p className="section-title mb-3">Gestionar</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="pill-ghost" onClick={() => moveHabit(existing.id, -1)}><ArrowUp size={16} />Subir</button>
            <button className="pill-ghost" onClick={() => moveHabit(existing.id, 1)}><ArrowDown size={16} />Bajar</button>
            {existing.lifecycle === 'active' && <button className="pill-ghost" onClick={() => pauseHabit(existing.id)}>Pausar</button>}
            {existing.lifecycle === 'paused' && <button className="pill-ghost" onClick={() => resumeHabit(existing.id)}>Reanudar</button>}
            {existing.lifecycle !== 'archived' ? (
              <button className="pill-ghost" onClick={() => archiveHabit(existing.id)}>Archivar</button>
            ) : (
              <button className="pill-ghost" onClick={() => unarchiveHabit(existing.id)}>Restaurar</button>
            )}
          </div>
          <p className="text-[12px] text-dim mt-3">
            Pausar o archivar conserva todo el historial; los días en pausa no cuentan ni rompen rachas.
          </p>
          <button className="pill w-full mt-3 text-[#F2A7A7] border border-line2" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Eliminar hábito
          </button>
        </Card>
      )}

      <Sheet open={iconOpen} onClose={() => setIconOpen(false)} title="Ícono">
        <div className="grid grid-cols-6 gap-2">
          {Object.keys(HABIT_ICONS).map((k) => (
            <button
              key={k}
              className={`aspect-square rounded-xl flex items-center justify-center border ${f.icon === k ? 'border-violet bg-violet-soft text-violet-text' : 'border-line2 bg-card2 text-muted'}`}
              onClick={() => { set('icon', k); setIconOpen(false); }}
              aria-label={k}
            >
              <HabitIcon name={k} size={22} />
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="¿Eliminar hábito?">
        <p className="text-sm text-muted mb-4">
          Se borrará "{existing?.name}" con todo su historial. Esto no se puede deshacer. Si solo quieres dejarlo, mejor archívalo.
        </p>
        <button
          className="pill w-full bg-[#3A1F24] text-[#F2A7A7]"
          onClick={async () => { await deleteHabit(existing!.id); nav('/habitos', { replace: true }); }}
        >
          Eliminar definitivamente
        </button>
      </Sheet>
    </Screen>
  );
}

function DayPicker({ value, onToggle, dashed = false }: { value: Weekday[]; onToggle: (d: Weekday) => void; dashed?: boolean }) {
  return (
    <div className="flex justify-between mt-3">
      {WEEKDAY_LETTER.map((l, i) => {
        const on = value.includes(i as Weekday);
        return (
          <button
            key={l}
            type="button"
            onClick={() => onToggle(i as Weekday)}
            aria-pressed={on}
            className={`w-11 h-11 rounded-full text-sm font-semibold transition ${
              on ? (dashed ? 'border-2 border-dashed border-violet text-violet-text bg-violet-soft' : 'bg-violet text-white') : 'border border-line2 text-muted'
            }`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

function ChecklistEditor({ items, onChange }: { items: ChecklistItem[]; onChange: (v: ChecklistItem[]) => void }) {
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const update = (id: string, patch: Partial<ChecklistItem>) => onChange(updateItem(items, id, patch));
  const add = () => {
    const next = addItem(items);
    setJustAdded(next[next.length - 1].id);
    onChange(next);
  };
  const named = items.filter((i) => i.name.trim()).length;

  return (
    <div className="mt-4 space-y-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-semibold">Elementos de la lista</p>
        <span className="text-[12px] text-muted">{named} {named === 1 ? 'elemento' : 'elementos'}</span>
      </div>
      <p className="text-[12px] text-muted">
        Agrega los que quieras. Completo = todos los obligatorios marcados. Mínimo = todos los esenciales marcados.
        La app no sugiere productos ni dosis: solo registra lo que tú escribes.
      </p>

      {items.map((it, i) => (
        <div key={it.id} className="card2 p-3 space-y-2.5" data-testid="checklist-item">
          <div className="flex items-center gap-1.5">
            <span className="w-6 text-center text-[13px] font-semibold text-muted shrink-0">{i + 1}</span>
            <input
              className="field"
              value={it.name}
              placeholder="Nombre"
              aria-label={`Nombre del elemento ${i + 1}`}
              autoFocus={it.id === justAdded}
              ref={(el) => {
                if (el && it.id === justAdded) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
              }}
              onChange={(e) => update(it.id, { name: e.target.value })}
            />
          </div>
          <input
            className="field"
            value={it.note ?? ''}
            placeholder="Dosis o nota (texto libre)"
            aria-label={`Dosis o nota del elemento ${i + 1}`}
            onChange={(e) => update(it.id, { note: e.target.value })}
          />
          <div>
            <p className="text-[12px] text-muted mb-1.5">Momento del día</p>
            <div className="flex gap-2 flex-wrap">
              {TIMES_OF_DAY.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={it.timeOfDay === t.value}
                  className={it.timeOfDay === t.value ? 'chip-on' : 'chip-off'}
                  onClick={() => update(it.id, { timeOfDay: it.timeOfDay === t.value ? '' : t.value })}
                >
                  {t.label}
                </button>
              ))}
              {it.timeOfDay && !TIMES_OF_DAY.some((t) => t.value === it.timeOfDay) && (
                <button type="button" className="chip-on" onClick={() => update(it.id, { timeOfDay: '' })}>
                  {timeLabel(it.timeOfDay)}
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              aria-pressed={it.required}
              className={it.required ? 'chip-on' : 'chip-off'}
              onClick={() => update(it.id, { required: !it.required })}
            >
              Obligatorio
            </button>
            <button
              type="button"
              aria-pressed={it.essential}
              className={it.essential ? 'chip-on' : 'chip-off'}
              onClick={() => update(it.id, { essential: !it.essential })}
            >
              Esencial (mínimo)
            </button>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-line">
            <div className="flex">
              <button
                type="button"
                className="icon-btn disabled:opacity-25"
                aria-label={`Subir elemento ${i + 1}`}
                disabled={i === 0}
                onClick={() => onChange(moveItem(items, it.id, -1))}
              >
                <ArrowUp size={17} />
              </button>
              <button
                type="button"
                className="icon-btn disabled:opacity-25"
                aria-label={`Bajar elemento ${i + 1}`}
                disabled={i === items.length - 1}
                onClick={() => onChange(moveItem(items, it.id, 1))}
              >
                <ArrowDown size={17} />
              </button>
            </div>
            <button
              type="button"
              className="pill text-[#F2A7A7] min-h-[40px] px-3"
              aria-label={`Borrar elemento ${i + 1}`}
              onClick={() => onChange(removeItem(items, it.id))}
            >
              <Trash2 size={16} /> Borrar
            </button>
          </div>
        </div>
      ))}

      {/* Always reachable: sticks above the bottom navigation while the list is on screen */}
      <div className="sticky z-10 pt-2 pb-1 bg-card" style={{ bottom: 'calc(64px + var(--safe-bottom))' }}>
        <button type="button" className="pill-ghost w-full border-violet/60 text-violet-text" onClick={add}>
          <Plus size={16} /> {items.length ? 'Agregar otro' : 'Agregar elemento'}
        </button>
      </div>
      {items.some((i) => !i.name.trim()) && (
        <p className="text-[12px] text-dim">Los elementos sin nombre no se guardan.</p>
      )}
    </div>
  );
}
