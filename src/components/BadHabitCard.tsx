import { History, Pencil, Play, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from '../config/brand';
import type { BadHabit, Relapse } from '../db/types';
import { addRelapse, deleteRelapse, setBadHabitLifecycle, updateRelapse } from '../db/repo';
import { badHabitStats, badStrip, relapsesOf } from '../domain/bad';
import { useData } from '../hooks/useData';
import { formatLong, formatShort } from '../lib/dates';
import { HabitIcon } from './icons';
import { Card, Sheet } from './ui';

export function BadHabitCard({ bad }: { bad: BadHabit }) {
  const { relapses, today } = useData()!;
  const stats = badHabitStats(bad, relapses, today);
  const strip = badStrip(bad, relapses, today);
  const [relapseOpen, setRelapseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [justRelapsed, setJustRelapsed] = useState(false);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-card2 border border-line2 text-muted flex items-center justify-center shrink-0">
            <HabitIcon name={bad.icon} />
          </span>
          <p className="font-semibold truncate">{bad.name}</p>
        </div>
        <Link to={`/malos/${bad.id}/editar`} className="icon-btn -mr-2 -mt-1" aria-label="Editar">
          <Pencil size={17} />
        </Link>
      </div>

      <div className="flex items-end justify-between mt-3">
        <div>
          <p className="text-[52px] leading-none font-bold tracking-tight">{stats.current}</p>
          <p className="text-[13px] text-muted mt-1">{stats.current === 1 ? 'día sin caer' : 'días sin caer'}</p>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-muted">Mejor marca</p>
          <p className="text-lg font-semibold text-violet-text">{stats.best} días</p>
        </div>
      </div>

      <div className="flex gap-[5px] mt-4" aria-label="Últimos 14 días">
        {strip.map((d) => (
          <span
            key={d.date}
            title={formatShort(d.date)}
            className={`flex-1 h-6 rounded-md ${d.state === 'clean' ? 'bg-violet' : d.state === 'relapse' ? 'bg-line2' : 'bg-[#121217]'} ${d.date === today ? 'ring-1 ring-ink/70' : ''}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-dim mt-1.5">
        <span>Hace 14 días</span>
        <span>Hoy</span>
      </div>

      {(bad.trigger || bad.replacement) && (
        <div className="grid grid-cols-2 gap-2 mt-4">
          {bad.trigger && (
            <div className="card2 p-3">
              <p className="text-[11px] text-muted mb-1">Cuándo me da</p>
              <p className="text-[13px]">{bad.trigger}</p>
            </div>
          )}
          {bad.replacement && (
            <div className="card2 p-3">
              <p className="text-[11px] text-muted mb-1">En vez de eso</p>
              <p className="text-[13px]">{bad.replacement}</p>
            </div>
          )}
        </div>
      )}

      {stats.lastRelapse && (
        <p className="text-[12px] text-dim mt-3">Última recaída: {formatLong(stats.lastRelapse.date)}</p>
      )}

      {justRelapsed && (
        <div className="card2 p-3 mt-3 text-[13px] text-night-text bg-night-bg border-night-line">
          <p className="font-semibold mb-0.5">{BRAND.comebackTitle}</p>
          <p>{BRAND.relapseBody}</p>
        </div>
      )}

      {bad.lifecycle === 'active' && (
        <div className="flex gap-2 mt-4">
          <button className="pill-ghost flex-1" onClick={() => setRelapseOpen(true)}>
            Tuve una recaída
          </button>
          <button className="pill-ghost w-11 px-0" aria-label="Historial de recaídas" onClick={() => setHistoryOpen(true)}>
            <History size={18} />
          </button>
        </div>
      )}
      {bad.lifecycle === 'active' && !justRelapsed && <p className="text-[12px] text-dim mt-3">{BRAND.relapseBody}</p>}
      {bad.lifecycle !== 'active' && (
        <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-line">
          <span className="text-[12px] text-muted">
            {bad.lifecycle === 'archived' ? `Archivado${bad.archivedAt ? ` el ${formatShort(bad.archivedAt)}` : ''}` : 'En pausa'}
          </span>
          <button className="pill-ghost min-h-[40px] text-violet-text" onClick={() => setBadHabitLifecycle(bad.id, 'active')}>
            {bad.lifecycle === 'archived' ? <RotateCcw size={15} /> : <Play size={15} />}
            {bad.lifecycle === 'archived' ? 'Restaurar' : 'Reanudar'}
          </button>
        </div>
      )}

      <RelapseSheet
        open={relapseOpen}
        onClose={() => setRelapseOpen(false)}
        onSave={async (date, note) => {
          await addRelapse(bad.id, date, note);
          setRelapseOpen(false);
          setJustRelapsed(true);
        }}
      />
      <RelapseHistory open={historyOpen} onClose={() => setHistoryOpen(false)} list={relapsesOf(bad, relapses)} />
    </Card>
  );
}

function RelapseSheet({
  open, onClose, onSave, initial,
}: { open: boolean; onClose: () => void; onSave: (date: string, note: string) => void; initial?: Relapse }) {
  const { today } = useData()!;
  const [date, setDate] = useState(initial?.date ?? today);
  const [note, setNote] = useState(initial?.note ?? '');
  return (
    <Sheet open={open} onClose={onClose} title={initial ? 'Editar recaída' : 'Registrar recaída'}>
      {!initial && <p className="text-sm text-muted mb-4">Pasa. Lo registramos sin drama y seguimos. Tu mejor marca se queda.</p>}
      <label className="label">Fecha</label>
      <input type="date" className="field" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      <label className="label mt-3">Nota (opcional)</label>
      <textarea className="field min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="¿Qué pasó? ¿Qué lo disparó?" />
      <button className="pill-primary w-full mt-4" disabled={!date} onClick={() => onSave(date, note)}>
        Guardar
      </button>
    </Sheet>
  );
}

function RelapseHistory({ open, onClose, list }: { open: boolean; onClose: () => void; list: Relapse[] }) {
  const [editing, setEditing] = useState<Relapse | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <>
      <Sheet open={open && !editing} onClose={onClose} title="Recaídas">
        {list.length === 0 ? (
          <p className="text-sm text-muted py-4">Sin recaídas registradas.</p>
        ) : (
          <ul className="divide-y divide-line">
            {[...list].reverse().map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{formatLong(r.date)}</p>
                  {r.note && <p className="text-[12px] text-muted truncate">{r.note}</p>}
                </div>
                <button className="icon-btn" aria-label="Editar recaída" onClick={() => setEditing(r)}>
                  <Pencil size={16} />
                </button>
                {confirmId === r.id ? (
                  <button className="chip border-line2 text-ink" onClick={() => { deleteRelapse(r.id); setConfirmId(null); }}>
                    Borrar
                  </button>
                ) : (
                  <button className="icon-btn" aria-label="Borrar recaída" onClick={() => setConfirmId(r.id)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-dim mt-3">Si registraste una recaída por error, bórrala y tu contador se recalcula.</p>
      </Sheet>
      {editing && (
        <RelapseSheet
          open
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (date, note) => {
            await updateRelapse(editing.id, { date, note: note.trim() || undefined });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
