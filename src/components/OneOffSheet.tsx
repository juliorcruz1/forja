import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createOneOff, deleteHabit, updateOneOff } from '../db/repo';
import type { Habit } from '../db/types';
import { type DateKey, formatLong, todayKey } from '../lib/dates';
import { HABIT_ICONS, HabitIcon } from './icons';
import { Sheet } from './ui';

/**
 * Create or edit a "Solo para hoy" habit: just a name and an icon. It exists
 * only on `date`, counts as an extra and never affects the day % or streaks.
 */
export function OneOffSheet({
  open, date, habit, onClose,
}: { open: boolean; date: DateKey; habit?: Habit | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('sparkles');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(habit?.name ?? '');
    setIcon(habit?.icon ?? 'sparkles');
    setConfirmDelete(false);
  }, [open, habit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!name.trim()) return;
    if (habit) await updateOneOff(habit.id, name, icon);
    else await createOneOff(date, name, icon);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={habit ? 'Editar "solo para hoy"' : 'Solo para hoy'}>
      <p className="text-[13px] text-muted -mt-1 mb-4">
        {formatLong(habit?.oneOffDate ?? date)} · Cuenta como extra: no afecta tu porcentaje ni tus rachas.
      </p>
      <label className="label" htmlFor="oneoff-name">Nombre</label>
      <input
        id="oneoff-name"
        className="field"
        value={name}
        maxLength={40}
        placeholder="Ej. Llamar a mamá"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      <label className="label mt-4">Ícono</label>
      <div className="grid grid-cols-7 gap-2">
        {Object.keys(HABIT_ICONS).map((k) => (
          <button
            key={k}
            type="button"
            aria-label={k}
            aria-pressed={icon === k}
            onClick={() => setIcon(k)}
            className={`aspect-square rounded-xl flex items-center justify-center border ${
              icon === k ? 'border-violet bg-violet-soft text-violet-text' : 'border-line2 bg-card2 text-muted'
            }`}
          >
            <HabitIcon name={k} size={19} />
          </button>
        ))}
      </div>
      <button className="pill-primary w-full mt-5 disabled:opacity-40" disabled={!name.trim()} onClick={save}>
        {habit ? 'Guardar cambios' : date === todayKey() ? 'Agregar a hoy' : 'Agregar a este día'}
      </button>

      {habit &&
        (confirmDelete ? (
          <div className="card2 p-3 mt-3">
            <p className="text-[13px] text-muted mb-3">Se borrará "{habit.name}" y su registro de este día. No se puede deshacer.</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="pill-ghost" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button
                className="pill bg-[#3A1F24] text-[#F2A7A7]"
                onClick={async () => {
                  await deleteHabit(habit.id);
                  onClose();
                }}
              >
                Borrar
              </button>
            </div>
          </div>
        ) : (
          <button className="pill w-full mt-2 text-[#F2A7A7]" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Borrar
          </button>
        ))}
    </Sheet>
  );
}
