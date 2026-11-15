import { HeartHandshake, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { focusTotals, formatClock, formatMinutes, remainingMs, runningSession } from '../domain/focus';
import { useData } from '../hooks/useData';
import { useNow } from '../hooks/useNow';

/** Inicio shortcuts: focus session (with live time left) and "Momento de ganas". */
export function QuickActions() {
  const { focusSessions, today } = useData()!;
  const now = useNow(1000);
  const running = runningSession(focusSessions, now);
  const minutes = focusTotals(focusSessions, today, today).minutes;
  return (
    <div className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
      <Link to="/concentracion" className={`card p-3.5 flex flex-col items-start gap-2.5 active:scale-[0.98] transition ${running ? 'border-violet/60' : ''}`}>
        <span className="w-10 h-10 rounded-xl bg-violet-soft text-violet-text flex items-center justify-center shrink-0">
          <Timer size={19} />
        </span>
        <span className="min-w-0 w-full">
          <span className="block text-[0.875rem] font-medium">Concentración</span>
          <span className="block text-[0.75rem] text-muted tabular-nums">
            {running ? `${formatClock(remainingMs(running, now))} restantes` : minutes ? `${formatMinutes(minutes)} hoy` : 'Iniciar sesión'}
          </span>
        </span>
      </Link>
      <Link to="/ganas" className="card p-3.5 flex flex-col items-start gap-2.5 active:scale-[0.98] transition">
        <span className="w-10 h-10 rounded-xl bg-blue-soft text-blue-text flex items-center justify-center shrink-0">
          <HeartHandshake size={19} />
        </span>
        <span className="min-w-0 w-full">
          <span className="block text-[0.875rem] font-medium">Momento de ganas</span>
          <span className="block text-[0.75rem] text-muted">Pausa 2 minutos</span>
        </span>
      </Link>
    </div>
  );
}
