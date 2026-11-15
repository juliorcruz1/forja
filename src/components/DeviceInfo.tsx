import { Check, Copy, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { viewportReport } from '../lib/viewport';
import { Card } from './ui';

export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD = __APP_BUILD__;

type Report = ReturnType<typeof viewportReport>;

/**
 * "Versión x.y.z" plus a screen diagnostic to verify the installed app on a
 * real iPhone: is the bottom bar touching the physical edge?
 */
export function DeviceInfo() {
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);
  const run = () => setReport(viewportReport());
  // In the installed app the bar must end exactly at the physical screen edge.
  const gap = report && report.navBottom !== null ? report.screenBottom - report.navBottom : null;
  const ok = gap !== null && Math.abs(gap) <= 1;
  const text = report
    ? [
        `FORJA ${APP_VERSION} (${APP_BUILD})`,
        `Modo app instalada: ${report.standalone ? 'sí' : 'no (navegador)'}`,
        `Pantalla: ${report.screen} · Ventana: ${report.inner} · Alto app: ${report.appHeight}`,
        `Barra termina en ${report.navBottom}px · borde ${report.screenBottom}px · diferencia ${gap}px`,
        `Áreas seguras: arriba ${report.safe.top}, abajo ${report.safe.bottom}, izq ${report.safe.left}, der ${report.safe.right}`,
        `Texto base: ${report.rootFont}`,
        `Navegador: ${navigator.userAgent}`,
      ].join('\n')
    : '';

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Versión {APP_VERSION}</p>
          <p className="text-[0.75rem] text-dim">Compilación {APP_BUILD}</p>
        </div>
        <button className="pill-ghost text-[0.8125rem] px-3.5" onClick={run}>
          <RefreshCw size={15} /> Diagnóstico
        </button>
      </div>
      {report && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p className={`rounded-xl px-3 py-2 text-[0.875rem] font-medium ${ok ? 'bg-violet-soft text-violet-text' : 'bg-card2 text-ink'}`}>
            {report.standalone
              ? ok
                ? 'La barra inferior llega al borde de la pantalla.'
                : `La barra queda ${gap} px arriba del borde. Copia este diagnóstico y compártelo.`
              : 'Estás en el navegador. Abre FORJA desde su ícono para revisar la app instalada.'}
          </p>
          <pre className="card2 p-3 text-[0.6875rem] leading-relaxed text-muted whitespace-pre-wrap break-words">{text}</pre>
          <button
            className="pill-ghost w-full text-[0.8125rem]"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* clipboard unavailable */
              }
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiado' : 'Copiar diagnóstico'}
          </button>
        </div>
      )}
    </Card>
  );
}
