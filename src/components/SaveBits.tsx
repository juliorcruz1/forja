import { Check, RotateCw, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AutoSaver, type SaveState } from '../lib/autosave';

/** One saver per editor (re-created when `deps` change, e.g. another day). */
export function useAutoSaver<P extends object>(make: () => AutoSaver<P>, deps: unknown[]) {
  const saver = useMemo(make, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const state = useSyncExternalStore(saver.subscribe, saver.getState);
  useEffect(() => saver.attach(), [saver]);
  return [saver, state] as const;
}

const hhmm = (d: Date) => d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

/** Small status shown next to the screen title. */
export function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.kind === 'error') {
    return (
      <span className="flex items-center gap-1 text-[0.75rem] text-blue-text" role="alert" data-testid="save-status" data-state="error">
        No se pudo guardar
        <button className="hit font-semibold underline underline-offset-2 px-1" onClick={onRetry}>Reintentar</button>
      </span>
    );
  }
  const text =
    state.kind === 'pending' || state.kind === 'saving' ? 'Guardando…'
      : state.kind === 'saved' ? `Guardado ✓ ${hhmm(state.at)}`
        : '';
  return (
    <span className="text-[0.75rem] text-muted whitespace-nowrap" aria-live="polite" data-testid="save-status" data-state={state.kind}>
      {text}
    </span>
  );
}

/** "Guardar" button pinned to the bottom of the screen while editing. */
export function SaveBar({ saver }: { saver: AutoSaver<object> }) {
  const [flash, setFlash] = useState<'ok' | 'fail' | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(t.current), []);
  const click = async () => {
    // Commit whatever the focused field holds before saving.
    const ok = await saver.flush();
    setFlash(ok ? 'ok' : 'fail');
    clearTimeout(t.current);
    t.current = setTimeout(() => setFlash(null), 2000);
  };
  return (
    <div className="save-bar sticky bottom-0 z-10 -mx-4 px-4 pt-3 pb-3">
      <button
        className="pill-primary w-full"
        // Keep the keyboard's field focused until our click runs (iOS blurs first otherwise; both save).
        onPointerDown={(e) => e.preventDefault()}
        onClick={click}
        data-testid="save-button"
      >
        {flash === 'ok' ? <><Check size={17} /> Guardado ✓</> : flash === 'fail' ? <><RotateCw size={17} /> Reintentar</> : <><Save size={17} /> Guardar</>}
      </button>
    </div>
  );
}
