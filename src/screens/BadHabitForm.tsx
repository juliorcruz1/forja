import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BAD_ICON_KEYS, HabitIcon } from '../components/icons';
import { Card, Screen, Sheet } from '../components/ui';
import { BAD_HABIT_SUGGESTIONS } from '../config/defaults';
import { deleteBadHabit, saveBadHabit, setBadHabitLifecycle } from '../db/repo';
import { useData } from '../hooks/useData';

export function BadHabitFormScreen() {
  const { id } = useParams();
  const data = useData();
  const nav = useNavigate();
  const existing = id ? data?.badHabits.find((b) => b.id === id) : undefined;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('smartphone');
  const [trigger, setTrigger] = useState('');
  const [replacement, setReplacement] = useState('');
  const [startDate, setStartDate] = useState(data?.today ?? '');
  const [loaded, setLoaded] = useState(!id);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (existing && !loaded) {
      setName(existing.name);
      setIcon(existing.icon);
      setTrigger(existing.trigger ?? '');
      setReplacement(existing.replacement ?? '');
      setStartDate(existing.startDate);
      setLoaded(true);
    }
  }, [existing, loaded]);
  useEffect(() => {
    if (!startDate && data) setStartDate(data.today);
  }, [data, startDate]);

  if (!data || !loaded) return null;

  const save = async () => {
    await saveBadHabit({
      id: existing?.id,
      name: name.trim(),
      icon,
      trigger: trigger.trim() || undefined,
      replacement: replacement.trim() || undefined,
      startDate: startDate || data.today,
    });
    nav('/habitos?tab=malos', { replace: true });
  };

  return (
    <Screen title={existing ? 'Editar hábito malo' : 'Nuevo hábito malo'} back>
      <Card>
        <label className="label" htmlFor="bname">¿Qué quieres dejar?</label>
        <input id="bname" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Escribe o elige una sugerencia" maxLength={40} />
        {!existing && (
          <div className="flex gap-2 flex-wrap mt-3">
            {BAD_HABIT_SUGGESTIONS.map((s) => (
              <button key={s} className="chip-off" onClick={() => setName(s)}>{s}</button>
            ))}
          </div>
        )}
        <label className="label mt-4">Ícono</label>
        <div className="flex gap-2 flex-wrap">
          {BAD_ICON_KEYS.map((k) => (
            <button
              key={k}
              aria-label={k}
              onClick={() => setIcon(k)}
              className={`w-11 h-11 rounded-xl flex items-center justify-center border ${icon === k ? 'border-violet bg-violet-soft text-violet-text' : 'border-line2 bg-card2 text-muted'}`}
            >
              <HabitIcon name={k} />
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <label className="label" htmlFor="trigger">Cuándo me da</label>
        <textarea id="trigger" className="field min-h-[70px]" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="Ej. Cuando estoy cansado en la noche" />
        <label className="label mt-4" htmlFor="repl">En vez de eso</label>
        <textarea id="repl" className="field min-h-[70px]" value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="Ej. Leo 2 páginas o salgo a caminar" />
        <label className="label mt-4" htmlFor="start">Contar desde</label>
        <input id="start" type="date" className="field" value={startDate} max={data.today} onChange={(e) => setStartDate(e.target.value)} />
      </Card>
      <button className="pill-primary w-full disabled:opacity-40" disabled={!name.trim()} onClick={save}>
        {existing ? 'Guardar cambios' : 'Empezar a contar'}
      </button>

      {existing && (
        <Card>
          <div className="grid grid-cols-2 gap-2">
            {existing.lifecycle === 'active' ? (
              <button className="pill-ghost" onClick={() => setBadHabitLifecycle(existing.id, 'paused')}>Pausar</button>
            ) : (
              <button className="pill-ghost" onClick={() => setBadHabitLifecycle(existing.id, 'active')}>Reactivar</button>
            )}
            {existing.lifecycle !== 'archived' && (
              <button className="pill-ghost" onClick={() => setBadHabitLifecycle(existing.id, 'archived')}>Archivar</button>
            )}
          </div>
          <button className="pill w-full mt-3 text-[#F2A7A7] border border-line2" onClick={() => setConfirm(true)}>
            <Trash2 size={16} /> Eliminar
          </button>
        </Card>
      )}
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="¿Eliminar?">
        <p className="text-sm text-muted mb-4">Se borrará con todas sus recaídas. No se puede deshacer.</p>
        <button className="pill w-full bg-[#3A1F24] text-[#F2A7A7]" onClick={async () => { await deleteBadHabit(existing!.id); nav('/habitos?tab=malos', { replace: true }); }}>
          Eliminar definitivamente
        </button>
      </Sheet>
    </Screen>
  );
}
