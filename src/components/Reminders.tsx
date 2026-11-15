import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { updateSettings } from '../db/repo';
import { useData } from '../hooks/useData';
import { Card } from './ui';

export const APP_URL = 'https://juliorcruz1.github.io/forja/';

/** "Tu nombre" for the greeting. Saved on blur / Enter. */
export function NameSetting() {
  const { settings } = useData()!;
  const [name, setName] = useState(settings.userName);
  useEffect(() => setName(settings.userName), [settings.userName]);
  const save = () => {
    const n = name.trim().slice(0, 30);
    if (n !== settings.userName) updateSettings({ userName: n });
  };
  return (
    <Card>
      <label className="label" htmlFor="user-name">Tu nombre</label>
      <input
        id="user-name"
        className="field"
        value={name}
        maxLength={30}
        autoComplete="given-name"
        placeholder="Cómo quieres que te salude"
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <p className="text-[12px] text-dim mt-1.5">Se usa en el saludo del Inicio. Vive solo en este teléfono.</p>
    </Card>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without async clipboard permission
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function CopyRow({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">{label}</span>
        <button
          className="chip-off text-[12px] gap-1.5"
          onClick={async () => {
            if (await copyText(text)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }
          }}
          aria-label={`Copiar texto de ${label}`}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="text-[14px] text-muted mt-1.5">{text}</p>
    </div>
  );
}

/**
 * Daily reminders via the iOS Shortcuts app. A PWA cannot schedule
 * notifications without a server, so this explains how to set them up.
 */
export function RemindersSection() {
  const { settings } = useData()!;
  const name = settings.userName.trim();
  const hi = (word: string) => (name ? `${word}, ${name}.` : `${word}.`);
  const texts = [
    { time: '6:30 a. m.', text: `${hi('Buenos días')} Abre FORJA y mira qué te toca hoy.` },
    { time: '2:00 p. m.', text: `${name ? `¿Cómo va el día, ${name}?` : '¿Cómo va el día?'} Marca en FORJA lo que ya hiciste.` },
    { time: '9:00 p. m.', text: `${hi('Hora de cerrar el día')} Marca tus hábitos, anota tus minutos de redes y a dormir.` },
  ];
  return (
    <Card>
      <div id="recordatorios" className="scroll-mt-4" />
      <p className="font-semibold mb-1">Recordatorios del día</p>
      <p className="text-[12px] text-muted mb-3">
        FORJA no puede mandarte notificaciones a una hora fija (necesitaría un servidor). Con la app Atajos del iPhone
        creas 3 recordatorios diarios en un par de minutos.
      </p>
      <ol className="text-[13px] space-y-2 list-decimal pl-5 mb-4">
        <li>Abre <b>Atajos</b> → pestaña <b>Automatización</b> → <b>+</b> (Nueva automatización).</li>
        <li>Elige <b>Hora del día</b>, pon la hora (por ejemplo 6:30 a. m.), <b>Diariamente</b> y <b>Ejecutar inmediatamente</b>.</li>
        <li>Toca <b>Nueva automatización en blanco</b> y agrega la acción <b>Mostrar notificación</b>.</li>
        <li>Pega el texto de abajo y guarda. Repite para las 2:00 p. m. y las 9:00 p. m.</li>
        <li>Cuando llegue el aviso, abre FORJA desde su ícono en la pantalla de inicio.</li>
      </ol>
      <div className="space-y-2">
        {texts.map((t) => <CopyRow key={t.time} label={t.time} text={t.text} />)}
        <CopyRow label="Dirección de FORJA" text={APP_URL} />
      </div>
      <p className="text-[12px] text-dim mt-3">
        Importante: en iPhone, la app instalada guarda tus datos aparte de Safari. Si agregas la acción “Abrir URL”, se abre
        Safari y ahí no verás tus datos; por eso es mejor abrir FORJA desde su ícono.
      </p>
    </Card>
  );
}
