import { Check, RotateCcw, Scale } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { payDebt, resetDebts } from '../db/repo';
import type { Debt } from '../domain/punish';
import { useData } from '../hooks/useData';
import { addDays, formatLong } from '../lib/dates';
import { Sheet } from './ui';

/** Small Inicio card, only when there are pending debts (max 2). Neutral tone, never red. */
export function DebtsCard() {
  const { debts } = useData()!;
  const [confirmReset, setConfirmReset] = useState(false);
  if (debts.pending.length === 0) return null;
  return (
    <div className="card p-4" data-testid="debts-card">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold flex items-center gap-2">
          <Scale size={17} className="text-blue-text" /> Deudas pendientes
        </p>
        <Link to="/castigos" className="hit text-[0.8125rem] text-violet-text min-h-[32px] inline-flex items-center">Ver todo</Link>
      </div>
      <p className="text-[0.8125rem] text-muted mt-0.5">Hoy toca pagar la deuda y volver.</p>
      <ul className="mt-3 space-y-2">
        {debts.pending.map((d) => <DebtRow key={d.date} debt={d} />)}
      </ul>
      {debts.overflow && (
        <div className="card2 p-3 mt-3 text-[0.8125rem]">
          <p className="text-muted">Se juntaron más fallos de la cuenta. Mejor empezar limpio que cargar con todo.</p>
          <button className="pill-ghost w-full mt-2" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={15} /> Reiniciar deudas
          </button>
        </div>
      )}
      <ResetSheet open={confirmReset} onClose={() => setConfirmReset(false)} pending={debts.pending} />
    </div>
  );
}

export function DebtRow({ debt }: { debt: Debt }) {
  return (
    <li className="card2 p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[0.875rem] font-medium">{debt.detail || debt.label}</p>
        <p className="text-[0.75rem] text-muted">
          {debt.label} · por {formatLong(debt.date).toLowerCase()}
        </p>
      </div>
      <button
        className="pill-primary px-3.5 shrink-0"
        onClick={() => payDebt(debt)}
        aria-label={`Marcar como pagada: ${debt.detail || debt.label}`}
      >
        <Check size={15} /> Pagada
      </button>
    </li>
  );
}

export function ResetSheet({ open, onClose, pending }: { open: boolean; onClose: () => void; pending: Debt[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="¿Reiniciar deudas?">
      <p className="text-sm text-muted mb-4">
        Se borran las {pending.length} deudas pendientes y empiezas de cero. Quedan en tu historial como reiniciadas.
        Lo que importa es volver mañana.
      </p>
      <button
        className="pill-primary w-full"
        onClick={async () => {
          await resetDebts(pending);
          onClose();
        }}
      >
        Sí, empezar limpio
      </button>
      <button className="pill-ghost w-full mt-2" onClick={onClose}>Cancelar</button>
    </Sheet>
  );
}

/** "por el lunes 9" helper for due dates. */
export const dueLabel = (d: Debt) => formatLong(addDays(d.date, 1));
