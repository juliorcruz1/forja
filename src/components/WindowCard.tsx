import { Moon, Sun } from 'lucide-react';
import { finishWindow, startWindow } from '../db/repo';
import { useData } from '../hooks/useData';
import { useNow } from '../hooks/useNow';
import { formatTime } from '../lib/dates';
import { activeWindow, nextWindow, windowLabel, windowLogFor, windowOver, windowsFor } from '../domain/windows';

/**
 * Phone-free window status for Inicio. A friendly reminder, never a block:
 * the app cannot lock the phone (that's iOS Screen Time / Focus modes).
 */
export function WindowCard() {
  const { settings, windowLogs, today } = useData()!;
  const now = useNow(30000);
  const P = settings.points;
  const specs = windowsFor(settings, today);
  if (specs.length === 0) return null;

  // 1) A window that was started and not answered yet
  const open = windowLogs.find((l) => l.date === today && !l.endedAt);
  if (open) {
    const spec = specs.find((s) => s.kind === open.kind);
    const over = spec ? windowOver(spec, now) : true;
    return (
      <Shell kind={open.kind}>
        <p className="font-semibold">Ventana {windowLabel(open.kind)} {over ? 'terminada' : 'en curso'}</p>
        <p className="text-[0.8125rem] opacity-90">
          {over ? '¿La cumpliste? Responde con honestidad: no cumplirla no resta.' : `Hasta las ${formatTime(spec!.end)}. Deja el celular lejos.`}
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button className="pill-primary" onClick={() => finishWindow(open.id, true)}>La cumplí · +{P.windowKept}</button>
          <button className="pill-ghost" onClick={() => finishWindow(open.id, false)}>No esta vez</button>
        </div>
      </Shell>
    );
  }

  // 2) We are inside a window right now
  const active = activeWindow(settings, now);
  if (active) {
    const log = windowLogFor(windowLogs, today, active.kind);
    if (log) {
      return (
        <div className="card2 px-4 py-3 text-[0.8125rem] flex items-center gap-3">
          {active.kind === 'night' ? <Moon size={17} className="text-night-text" /> : <Sun size={17} className="text-blue-text" />}
          <span>Ventana {windowLabel(active.kind)}: {log.kept ? `cumplida · +${P.windowKept} pts` : 'registrada'}.</span>
        </div>
      );
    }
    return (
      <Shell kind={active.kind}>
        <p className="font-semibold">
          {active.kind === 'night' ? 'Es tu hora sin celular' : 'Primeros minutos del día sin celular'}
        </p>
        <p className="text-[0.8125rem] opacity-90">
          {formatTime(active.start)} – {formatTime(active.end)}.{' '}
          {active.kind === 'night'
            ? 'Déjalo cargando lejos de la cama; mañana lo agradeces.'
            : 'Agua, luz y tus hábitos primero. El celular puede esperar.'}
        </p>
        <button className="pill-primary w-full mt-3" onClick={() => startWindow(today, active.kind)}>
          Iniciar ventana
        </button>
      </Shell>
    );
  }

  // 3) Otherwise, a small hint of the next one
  const next = nextWindow(settings, now);
  if (!next) return null;
  return (
    <p className="text-[0.75rem] text-muted px-1 flex items-center gap-1.5">
      {next.kind === 'night' ? <Moon size={13} /> : <Sun size={13} />}
      Próxima ventana sin celular: {formatTime(next.start)} – {formatTime(next.end)}
    </p>
  );
}

function Shell({ kind, children }: { kind: 'morning' | 'night'; children: React.ReactNode }) {
  return (
    <div className="rounded-card border p-4 flex gap-3 animate-fadeUp" style={{ background: '#1A1530', borderColor: '#3A2F66' }} role="status">
      {kind === 'night' ? <Moon size={20} className="text-night-text shrink-0 mt-0.5" /> : <Sun size={20} className="text-night-text shrink-0 mt-0.5" />}
      <div className="text-night-text flex-1">{children}</div>
    </div>
  );
}
