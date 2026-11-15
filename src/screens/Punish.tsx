import { Dices, PiggyBank, Plus, RotateCcw, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DebtRow, ResetSheet } from '../components/DebtsCard';
import { Card, Empty, Screen, SectionHeader, Sheet } from '../components/ui';
import { emptyJar, unpayDebt, updateSettings } from '../db/repo';
import { drawTask, PUNISH_LABEL, unsafePunishText } from '../domain/punish';
import { useData } from '../hooks/useData';
import { formatLong, formatShort } from '../lib/dates';

const STATUS: Record<string, string> = { pending: 'Pendiente', paid: 'Pagada', reset: 'Reiniciada', jar: 'Al frasco' };

/** "Castigos y frasco": pending and paid debts, history, the jar and the task list. */
export function PunishScreen() {
  const data = useData();
  const [resetOpen, setResetOpen] = useState(false);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [taskError, setTaskError] = useState<string | null>(null);
  const { hash } = useLocation();
  const ready = !!data;
  useEffect(() => {
    if (!hash || !ready) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [hash, ready]);
  if (!data) return null;
  const { debts, settings, today } = data;
  const p = settings.punish;
  const money = (n: number) => `${p.currency}${n.toLocaleString('es-MX')}`;
  const lastJarDate = debts.jar.entries[debts.jar.entries.length - 1]?.date;

  const addTask = () => {
    const t = newTask.trim();
    if (!t) return;
    const err = unsafePunishText(t);
    if (err) return setTaskError(err);
    updateSettings({ punish: { ...p, tasks: [...p.tasks, t] } });
    setNewTask('');
    setTaskError(null);
  };

  return (
    <Screen title="Castigos" subtitle="Deudas y frasco" back>
      {!p.enabled && (
        <Card>
          <p className="text-sm text-muted">
            Los castigos están apagados. <Link to="/ajustes#castigos" className="text-violet-text">Actívalos en Ajustes</Link>.
          </p>
        </Card>
      )}

      <Card>
        <p className="font-semibold">Pendientes</p>
        {debts.pending.length === 0 ? (
          <p className="text-[0.8125rem] text-muted mt-1">Nada pendiente. Así se ve ir al día.</p>
        ) : (
          <>
            <p className="text-[0.8125rem] text-muted mt-0.5">Hoy toca pagar la deuda y volver.</p>
            <ul className="mt-3 space-y-2">{debts.pending.map((d) => <DebtRow key={d.date} debt={d} />)}</ul>
            {debts.overflow && (
              <button className="pill-ghost w-full mt-3" onClick={() => setResetOpen(true)}>
                <RotateCcw size={15} /> Reiniciar deudas
              </button>
            )}
          </>
        )}
        <p className="text-[0.75rem] text-dim mt-3">
          Máximo 1 castigo por día y 2 pendientes a la vez. Descanso, opcionales, día pesado y comodín nunca generan castigo.
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-blue-soft text-blue-text flex items-center justify-center shrink-0">
            <PiggyBank size={21} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[0.8125rem] text-muted">Frasco</p>
            <p className="text-[1.75rem] leading-none font-bold" data-testid="jar-balance">{money(debts.jar.balance)}</p>
          </div>
          <button className="pill-ghost px-4 shrink-0 disabled:opacity-40" disabled={debts.jar.balance <= 0} onClick={() => setEmptyOpen(true)}>
            Vaciar
          </button>
        </div>
        <p className="text-[0.75rem] text-dim mt-2">
          {money(p.jarAmount)} por cada castigo de frasco · total histórico {money(debts.jar.total)}. Es virtual: no se mueve
          dinero real. Cómo lo uses es decisión tuya.
        </p>
        {debts.jar.empties.length > 0 && (
          <ul className="mt-3 space-y-1 text-[0.8125rem]">
            {[...debts.jar.empties].reverse().slice(0, 5).map((e) => (
              <li key={e.id} className="flex justify-between text-muted">
                <span>Vaciado el {formatShort(e.date)}</span>
                <span>{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div id="tareas" className="scroll-mt-4" />
        <p className="font-semibold flex items-center gap-2"><Dices size={17} className="text-violet-text" /> Tareas pendientes</p>
        <p className="text-[0.75rem] text-muted mt-0.5 mb-3">
          Cosas de unos 10 minutos que llevas posponiendo. Cuando toque, se sortea una.
          {p.tasks.length > 0 && <> Hoy saldría: <span className="text-ink">{drawTask(p.tasks, today)}</span>.</>}
        </p>
        <ul className="space-y-1.5">
          {p.tasks.map((t, i) => (
            <li key={`${t}-${i}`} className="flex items-center gap-2">
              <span className="flex-1 text-[0.875rem]">{t}</span>
              <button className="icon-btn" aria-label={`Quitar ${t}`} onClick={() => updateSettings({ punish: { ...p, tasks: p.tasks.filter((_, j) => j !== i) } })}>
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-2">
          <input
            className="field"
            placeholder="Ej. Ordenar el escritorio"
            value={newTask}
            maxLength={60}
            onChange={(e) => { setNewTask(e.target.value); setTaskError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
          />
          <button className="pill-ghost shrink-0" disabled={!newTask.trim()} onClick={addTask}>
            <Plus size={16} /> Agregar
          </button>
        </div>
        {taskError && <p className="text-[0.8125rem] text-blue-text mt-2">{taskError}</p>}
      </Card>

      <SectionHeader title="Historial" />
      {debts.history.length === 0 ? (
        <Empty>Aquí quedan las deudas pagadas, reiniciadas y lo que va al frasco.</Empty>
      ) : (
        <div className="card divide-y divide-line">
          {debts.history.slice(0, 40).map((d) => (
            <div key={`${d.date}-${d.status}`} className="flex items-center gap-3 px-4 py-2.5 min-h-[52px]">
              <div className="flex-1 min-w-0">
                <p className="text-[0.875rem]">{d.detail || d.label}</p>
                <p className="text-[0.75rem] text-muted">
                  {PUNISH_LABEL[d.type]} · {formatLong(d.date).toLowerCase()}
                  {d.event && d.status !== 'pending' ? ` · ${STATUS[d.status].toLowerCase()} el ${formatShort(d.event.date)}` : ''}
                </p>
              </div>
              <span className={`text-[0.75rem] shrink-0 ${d.status === 'pending' ? 'text-blue-text' : 'text-muted'}`}>{STATUS[d.status]}</span>
              {d.status === 'paid' && !d.orphan && (
                <button className="icon-btn -mr-2" aria-label="Deshacer pagada" onClick={() => unpayDebt(d.date)}>
                  <Undo2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[0.75rem] text-dim px-1">
        FORJA no bloquea apps ni dispositivos y no mueve dinero: todo funciona con tu palabra. Cambia tipos y montos en{' '}
        <Link to="/ajustes#castigos" className="hit text-violet-text">Ajustes</Link>.
      </p>

      <ResetSheet open={resetOpen} onClose={() => setResetOpen(false)} pending={debts.pending} />
      <Sheet open={emptyOpen} onClose={() => setEmptyOpen(false)} title="¿Vaciar el frasco?">
        <p className="text-sm text-muted mb-4">
          El frasco vuelve a {money(0)}. Los {money(debts.jar.balance)} quedan registrados en el historial.
        </p>
        <button
          className="pill-primary w-full"
          onClick={async () => {
            if (lastJarDate) await emptyJar(debts.jar.balance, lastJarDate);
            setEmptyOpen(false);
          }}
        >
          Vaciar {money(debts.jar.balance)}
        </button>
        <button className="pill-ghost w-full mt-2" onClick={() => setEmptyOpen(false)}>Cancelar</button>
      </Sheet>
    </Screen>
  );
}
