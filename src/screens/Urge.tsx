import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '../config/brand';
import { URGE_WAIT_SECONDS } from '../config/defaults';
import { resolveUrge, startUrge, updateUrge } from '../db/repo';
import type { Urge } from '../db/types';
import { dayProgress } from '../domain/habits';
import { isLimitHabit } from '../domain/social';
import { URGE_FEELINGS, URGE_SITUATIONS, urgeSecondsLeft } from '../domain/urges';
import { useData } from '../hooks/useData';
import { useNow } from '../hooks/useNow';

type Step = 'pause' | 'fell' | 'done-resisted' | 'done-fell';

/**
 * Full-screen pause for an urge: habits check, 2-minute countdown, quick
 * replacements, then "Resistí" or "Caí". Neutral tone, never guilt.
 */
export function UrgeScreen() {
  const data = useData();
  const nav = useNavigate();
  const now = useNow(1000);
  const [urge, setUrge] = useState<Urge | null>(null);
  const [step, setStep] = useState<Step>('pause');
  const [situation, setSituation] = useState('');
  const [feeling, setFeeling] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in dev
    started.current = true;
    startUrge().then(setUrge);
  }, []);

  if (!data || !urge) return <div className="fixed inset-0 z-50 bg-bg" />;
  const { habits, idx, today, settings, badHabits } = data;
  const progress = dayProgress(habits, today, idx, today);
  const left = urgeSecondsLeft(urge, URGE_WAIT_SECONDS, now);
  const ring = 1 - left / URGE_WAIT_SECONDS;
  const fallTargets = badHabits.filter((b) => b.lifecycle === 'active' && !isLimitHabit(b));
  const saveTrigger = () => updateUrge(urge.id, { situation: situation || undefined, feeling: feeling || undefined });
  const close = async () => {
    await saveTrigger();
    nav(-1);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-bg overflow-y-auto"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Momento de ganas"
    >
      <div className="max-w-[480px] mx-auto px-4">
        <div className="flex items-center justify-between pt-2">
          <p className="text-[0.8125rem] text-muted font-medium">Momento de ganas</p>
          <button className="icon-btn -mr-2" aria-label="Cerrar" onClick={close}>
            <X size={22} />
          </button>
        </div>

        {step === 'pause' && (
          <>
            <h1 className="text-[1.625rem] font-bold leading-tight mt-2">¿Ya hiciste tus hábitos de hoy?</h1>
            <p className="text-[0.875rem] text-muted mt-1">
              {progress.total === 0
                ? 'Hoy no tienes hábitos obligatorios.'
                : progress.missing.length === 0
                  ? `Sí: ${progress.done} de ${progress.total}. Vas bien, no lo arruines por un rato de scroll.`
                  : `Llevas ${progress.done} de ${progress.total}. Falta: ${progress.missing.map((h) => h.name).join(', ')}.`}
            </p>

            <div className="flex flex-col items-center my-7">
              <div className="relative w-[min(11.25rem,48vw)] aspect-square">
                <svg viewBox="0 0 180 180" width="100%" height="100%" className="-rotate-90">
                  <circle cx="90" cy="90" r="80" stroke="#23232C" strokeWidth="10" fill="none" />
                  <circle
                    cx="90" cy="90" r="80" stroke="#4F8CFF" strokeWidth="10" fill="none" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 80} strokeDashoffset={2 * Math.PI * 80 * (1 - ring)}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[2.75rem] font-bold tabular-nums leading-none" aria-label="Segundos restantes">
                    {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                  </p>
                  <p className="text-[0.75rem] text-muted mt-1">{left > 0 ? 'Espera un momento' : 'Ya pasó lo peor'}</p>
                </div>
              </div>
              <p className="text-[0.8125rem] text-muted text-center mt-4 max-w-[300px]">
                Las ganas suben y bajan como una ola. Respira y haz algo de esta lista mientras tanto.
              </p>
            </div>

            <p className="section-title mb-2">En vez de eso</p>
            <div className="grid grid-cols-2 gap-2">
              {settings.replacements.map((r) => (
                <button
                  key={r}
                  onClick={() => setPicked(picked === r ? null : r)}
                  aria-pressed={picked === r}
                  className={`rounded-2xl border px-3 min-h-[52px] text-left text-[0.875rem] flex items-center gap-2 transition ${
                    picked === r ? 'border-violet bg-violet-soft text-violet-text' : 'border-line2 bg-card'
                  }`}
                >
                  {picked === r && <Check size={15} className="shrink-0" />}
                  {r}
                </button>
              ))}
            </div>

            <p className="section-title mt-6 mb-2">¿Qué estaba pasando? (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {URGE_SITUATIONS.map((s) => (
                <button key={s} className={situation === s ? 'chip-on' : 'chip-off'} onClick={() => setSituation(situation === s ? '' : s)}>
                  {s}
                </button>
              ))}
            </div>
            <input
              className="field mt-2"
              placeholder="O escríbelo con tus palabras"
              value={URGE_SITUATIONS.includes(situation) ? '' : situation}
              onChange={(e) => setSituation(e.target.value)}
              maxLength={80}
            />
            <p className="section-title mt-4 mb-2">¿Cómo te sentías? (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {URGE_FEELINGS.map((f) => (
                <button key={f} className={feeling === f ? 'chip-on' : 'chip-off'} onClick={() => setFeeling(feeling === f ? '' : f)}>
                  {f}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-7 pb-4">
              <button
                className="pill-primary disabled:opacity-40"
                disabled={left > 0}
                onClick={async () => {
                  await saveTrigger();
                  await resolveUrge(urge.id, 'resisted');
                  setStep('done-resisted');
                }}
              >
                {left > 0 ? `Resistí (${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')})` : `Resistí · +${settings.points.resisted}`}
              </button>
              <button
                className="pill-ghost"
                onClick={async () => {
                  await saveTrigger();
                  if (fallTargets.length) setStep('fell');
                  else {
                    await resolveUrge(urge.id, 'fell');
                    setStep('done-fell');
                  }
                }}
              >
                Caí
              </button>
            </div>
          </>
        )}

        {step === 'fell' && (
          <div className="mt-6">
            <h1 className="text-[1.5rem] font-bold leading-tight">Pasa. Lo anotamos sin juicio.</h1>
            <p className="text-[0.875rem] text-muted mt-1">¿En cuál caíste? Tu contador vuelve a 0, pero tu mejor marca se queda.</p>
            <div className="space-y-2 mt-5">
              {fallTargets.map((b) => (
                <button
                  key={b.id}
                  className="w-full card p-4 text-left text-[0.9375rem] active:scale-[0.99] transition"
                  onClick={async () => {
                    await resolveUrge(urge.id, 'fell', b.id);
                    setStep('done-fell');
                  }}
                >
                  {b.name}
                </button>
              ))}
              <button
                className="w-full card2 p-4 text-left text-[0.9375rem] text-muted"
                onClick={async () => {
                  await resolveUrge(urge.id, 'fell');
                  setStep('done-fell');
                }}
              >
                Ninguno en especial (solo registrar)
              </button>
            </div>
          </div>
        )}

        {(step === 'done-resisted' || step === 'done-fell') && (
          <div className="mt-10 text-center">
            {step === 'done-resisted' ? (
              <>
                <p className="text-[3rem] font-bold text-violet-text">+{settings.points.resisted}</p>
                <h1 className="text-[1.5rem] font-bold mt-2">Bien ahí. Las ganas pasaron y tú seguiste.</h1>
                <p className="text-[0.875rem] text-muted mt-2">Cada vez que resistes, la siguiente es un poco más fácil.</p>
              </>
            ) : (
              <>
                <h1 className="text-[1.5rem] font-bold">{BRAND.comebackTitle}</h1>
                <p className="text-[0.875rem] text-muted mt-2 max-w-[320px] mx-auto">
                  Un tropiezo no borra lo que llevas. Mira cuándo te pasó para estar listo la próxima vez, y sigue con lo que toca.
                </p>
              </>
            )}
            <button className="pill-primary w-full mt-8" onClick={() => nav('/hoy', { replace: true })}>
              Volver al Inicio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
