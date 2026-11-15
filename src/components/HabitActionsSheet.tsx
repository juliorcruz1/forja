import { Archive, CalendarCheck, Pause, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  archiveHabit, deleteBadHabit, deleteHabit, habitRecordCount, pauseHabit, setBadHabitLifecycle,
} from '../db/repo';
import type { BadHabit, Habit } from '../db/types';
import { HabitIcon } from './icons';
import { Sheet } from './ui';

export type ActionTarget = { kind: 'good'; habit: Habit } | { kind: 'bad'; bad: BadHabit };

/**
 * Menu opened from Inicio by tapping (or long-pressing) a habit's name:
 * Editar, Pausar, Archivar, Borrar (+ the day's record for good habits).
 */
export function HabitActionsSheet({
  target, onClose, onDayRecord, onDone,
}: {
  target: ActionTarget | null;
  onClose: () => void;
  onDayRecord?: (h: Habit) => void;
  onDone: (message: string) => void;
}) {
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [records, setRecords] = useState<number | null>(null);
  const id = target ? (target.kind === 'good' ? target.habit.id : target.bad.id) : '';

  useEffect(() => {
    setConfirm(false);
    setRecords(null);
  }, [id]);

  if (!target) return null;
  const name = target.kind === 'good' ? target.habit.name : target.bad.name;
  const icon = target.kind === 'good' ? target.habit.icon : target.bad.icon;
  const recordWord = target.kind === 'good' ? 'registros' : 'recaídas';

  const run = async (fn: () => Promise<unknown>, message: string) => {
    await fn();
    onClose();
    onDone(message);
  };

  const askDelete = async () => {
    setRecords(await habitRecordCount(id, target.kind));
    setConfirm(true);
  };

  return (
    <Sheet open onClose={onClose} title={name}>
      <div className="flex items-center gap-2 text-[0.8125rem] text-muted -mt-2 mb-4">
        <HabitIcon name={icon} size={15} />
        <span>{target.kind === 'good' ? 'Hábito' : 'Hábito malo'}</span>
      </div>

      {!confirm ? (
        <div className="card2 divide-y divide-line overflow-hidden">
          {target.kind === 'good' && onDayRecord && (
            <Action icon={<CalendarCheck size={19} />} label="Registro del día" hint="Completo, mínimo, saltado, descanso o nota"
              onClick={() => { onClose(); onDayRecord(target.habit); }} />
          )}
          <Action icon={<Pencil size={19} />} label="Editar"
            onClick={() => { onClose(); nav(target.kind === 'good' ? `/habitos/${id}/editar` : `/malos/${id}/editar`); }} />
          <Action icon={<Pause size={19} />} label="Pausar" hint="Sale de hoy; los días en pausa no cuentan ni rompen rachas"
            onClick={() => run(
              () => (target.kind === 'good' ? pauseHabit(id) : setBadHabitLifecycle(id, 'paused')),
              `"${name}" en pausa. Reanúdalo en Hábitos → Pausados.`,
            )} />
          <Action icon={<Archive size={19} />} label="Archivar" hint="Sale de hoy; conserva su historial y estadísticas"
            onClick={() => run(
              () => (target.kind === 'good' ? archiveHabit(id) : setBadHabitLifecycle(id, 'archived')),
              `"${name}" archivado. Restáuralo en Hábitos → Archivados.`,
            )} />
          <Action icon={<Trash2 size={19} />} label="Borrar" danger hint="Elimina el hábito y todos sus registros" onClick={askDelete} />
        </div>
      ) : (
        <div role="alertdialog" aria-label="Confirmar borrado">
          <div className="rounded-2xl border border-[#5A2A32] bg-[#2A1519] p-4 flex gap-3">
            <TriangleAlert size={20} className="text-[#F2A7A7] shrink-0 mt-0.5" />
            <div className="text-[0.875rem] text-[#F2D0D0]">
              <p className="font-semibold">Esto no se puede deshacer.</p>
              <p className="mt-1">
                Se borrará "{name}" y {records === 1 ? `su ${recordWord.slice(0, -1)}` : `sus ${records ?? 0} ${recordWord}`}.
                Si solo quieres dejarlo, mejor archívalo: conservas su historial.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button className="pill-ghost" onClick={() => setConfirm(false)}>Cancelar</button>
            <button
              className="pill bg-[#3A1F24] text-[#F2A7A7]"
              onClick={() => run(
                () => (target.kind === 'good' ? deleteHabit(id) : deleteBadHabit(id)),
                `"${name}" se borró.`,
              )}
            >
              Borrar definitivamente
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Action({
  icon, label, hint, danger = false, onClick,
}: { icon: ReactNode; label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 min-h-[56px] py-2 text-left active:bg-card transition">
      <span className={danger ? 'text-[#F2A7A7]' : 'text-violet-text'}>{icon}</span>
      <span className="flex-1">
        <span className={`block text-[0.9375rem] ${danger ? 'text-[#F2A7A7]' : ''}`}>{label}</span>
        {hint && <span className="block text-[0.75rem] text-muted">{hint}</span>}
      </span>
    </button>
  );
}
