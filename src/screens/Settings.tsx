import { ChevronRight, Download, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, Screen, Sheet, Toggle } from '../components/ui';
import { BRAND } from '../config/brand';
import {
  type Backup, backupDue, backupFileName, backupSummary, createBackup, markBackedUp, parseBackup, restoreBackup,
} from '../db/backup';
import { updateSettings } from '../db/repo';
import type { DaySchedule } from '../db/types';
import { nightInfo } from '../domain/sleep';
import { useData } from '../hooks/useData';
import { PhoneSettings, PointsSettings } from '../components/SettingsStage2';
import { NameSetting, RemindersSection } from '../components/Reminders';
import { DeviceInfo } from '../components/DeviceInfo';
import { PunishSettings } from '../components/PunishSettings';
import { addDays, formatTime, WEEKDAY_NAMES, weekStart } from '../lib/dates';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TIME = 'field w-[9.5rem] py-2 text-center';

export function SettingsScreen() {
  const data = useData();
  const { hash } = useLocation();
  const backupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    setTimeout(() => (id === 'respaldo' ? backupRef.current : document.getElementById(id))?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [hash]);
  if (!data) return null;
  const { settings, today } = data;

  const setWork = (i: number, patch: Partial<DaySchedule>) =>
    updateSettings({ work: settings.work.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const setBed = (i: number, v: string) => updateSettings({ bedtime: settings.bedtime.map((b, j) => (j === i ? v : b)) });
  const ws = weekStart(today);
  const criticalNights = WEEKDAY_NAMES.filter((_, i) => nightInfo(settings, addDays(ws, i)).critical);

  return (
    <Screen title="Ajustes" back="/mas">
      <NameSetting />

      <Link to="/habitos" className="card p-4 flex items-center justify-between active:scale-[0.99] transition">
        <div>
          <p className="font-semibold">Hábitos</p>
          <p className="text-[0.8125rem] text-muted">Crear, editar, pausar o archivar</p>
        </div>
        <ChevronRight size={18} className="text-dim" />
      </Link>

      <Card>
        <p className="font-semibold mb-1">Horario laboral</p>
        <p className="text-[0.75rem] text-muted mb-3">Se usa para detectar noches críticas.</p>
        <div className="divide-y divide-line">
          {settings.work.map((d, i) => (
            <div key={i} className="py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.9375rem]">{cap(WEEKDAY_NAMES[i])}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[0.75rem] text-muted">{d.off ? 'Descanso' : 'Trabajo'}</span>
                  <Toggle checked={!d.off} onChange={(v) => setWork(i, { off: !v })} label={`Trabajo el ${WEEKDAY_NAMES[i]}`} />
                </div>
              </div>
              {!d.off && (
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <label className="text-[0.75rem] text-muted">
                    Entrada
                    <input type="time" className="field mt-1 py-2" value={d.start} onChange={(e) => e.target.value && setWork(i, { start: e.target.value })} />
                  </label>
                  <label className="text-[0.75rem] text-muted">
                    Salida
                    <input type="time" className="field mt-1 py-2" value={d.end} onChange={(e) => e.target.value && setWork(i, { end: e.target.value })} />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="font-semibold mb-1">Sueño</p>
        <p className="text-[0.75rem] text-muted mb-3">Hora habitual de acostarte cada noche.</p>
        <div className="divide-y divide-line">
          {settings.bedtime.map((b, i) => (
            <label key={i} className="flex items-center justify-between py-2 gap-3">
              <span className="text-[0.9375rem]">Noche del {WEEKDAY_NAMES[i]}</span>
              <input type="time" className={TIME} value={b} onChange={(e) => e.target.value && setBed(i, e.target.value)} />
            </label>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-line space-y-3">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="text-[0.9375rem] block">Hora en noches críticas</span>
              <span className="text-[0.75rem] text-muted">Cuando al día siguiente entras temprano</span>
            </span>
            <input type="time" className={TIME} value={settings.criticalBedtime} onChange={(e) => e.target.value && updateSettings({ criticalBedtime: e.target.value })} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="text-[0.9375rem] block">"Temprano" es antes de</span>
              <span className="text-[0.75rem] text-muted">Hora de entrada que activa la noche crítica</span>
            </span>
            <input type="time" className={TIME} value={settings.earlyStartThreshold} onChange={(e) => e.target.value && updateSettings({ earlyStartThreshold: e.target.value })} />
          </label>
          <p className="text-[0.75rem] text-night-text bg-night-bg border border-night-line rounded-xl px-3 py-2">
            {criticalNights.length
              ? `Noches críticas: ${criticalNights.join(' y ')} (acostarte a las ${formatTime(settings.criticalBedtime)}).`
              : 'Con tu horario actual no hay noches críticas.'}
          </p>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <p className="text-[0.9375rem]">La semana empieza en</p>
          <span className="text-[0.9375rem] text-muted">Lunes</span>
        </div>
      </Card>

      <PointsSettings />

      <PhoneSettings />

      <RemindersSection />

      <PunishSettings />

      <div ref={backupRef} className="scroll-mt-4">
        <BackupCard lastBackupAt={settings.lastBackupAt} />
      </div>

      <Card>
        <p className="font-semibold mb-2">Marca</p>
        <p className="text-[0.9375rem] tracking-[0.15em] font-bold">{BRAND.name}</p>
        <p className="text-[0.8125rem] text-muted">{BRAND.motto}</p>
        <p className="text-[0.6875rem] text-dim mt-2">El nombre y el lema se cambian en src/config/brand.ts.</p>
      </Card>

      <DeviceInfo />
    </Screen>
  );
}

function BackupCard({ lastBackupAt }: { lastBackupAt?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const due = backupDue(lastBackupAt);

  const doExport = async () => {
    setMsg(null);
    try {
      const backup = await createBackup();
      const json = JSON.stringify(backup, null, 2);
      const name = backupFileName();
      const file = new File([json], name, { type: 'application/json' });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        try {
          await navigator.share({ files: [file], title: name });
        } catch (e) {
          if ((e as Error).name === 'AbortError') return; // user cancelled: not a backup
          throw e;
        }
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
      await markBackedUp();
      setMsg({ kind: 'ok', text: `Respaldo creado: ${name}` });
    } catch {
      setMsg({ kind: 'err', text: 'No se pudo crear el respaldo.' });
    }
  };

  const onFile = async (f: File | undefined) => {
    setMsg(null);
    if (!f) return;
    try {
      setPending(parseBackup(await f.text()));
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    try {
      await restoreBackup(pending);
      setMsg({ kind: 'ok', text: 'Respaldo importado correctamente.' });
    } catch {
      setMsg({ kind: 'err', text: 'No se pudo importar. Tus datos no cambiaron.' });
    }
    setPending(null);
  };

  const summary = pending ? backupSummary(pending) : null;

  return (
    <Card>
      <p className="font-semibold mb-1">Respaldo</p>
      <p className="text-[0.8125rem] text-muted">
        Tus datos viven solo en este dispositivo. Exporta un respaldo cada semana y guárdalo en Archivos o iCloud Drive.
      </p>
      <p className={`text-[0.8125rem] mt-2 ${due ? 'text-blue-text' : 'text-muted'}`}>
        Último respaldo:{' '}
        {lastBackupAt ? new Date(lastBackupAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : 'nunca'}
        {due ? ` · ${BRAND.backupReminder}` : ''}
      </p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button className="pill-primary" onClick={doExport}>
          <Download size={16} /> Exportar
        </button>
        <button className="pill-ghost" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Importar
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {msg && <p className={`text-[0.8125rem] mt-3 ${msg.kind === 'ok' ? 'text-violet-text' : 'text-[#F2A7A7]'}`}>{msg.text}</p>}

      <Sheet open={!!pending} onClose={() => setPending(null)} title="¿Importar respaldo?">
        {summary && (
          <>
            <p className="text-sm text-muted mb-3">
              Esto <b className="text-ink">reemplazará todos los datos actuales</b> de este dispositivo por los del respaldo. Si no estás seguro, exporta primero un respaldo de lo que tienes ahora.
            </p>
            <div className="card2 p-3 text-[0.8125rem] space-y-1 mb-4">
              <p>Creado: {summary.exportedAt ? new Date(summary.exportedAt).toLocaleString('es-MX') : 'desconocido'}</p>
              <p>{summary.habits} hábitos · {summary.logs} registros</p>
              <p>{summary.journal} entradas de diario · {summary.badHabits} hábitos malos</p>
            </div>
            <button className="pill-primary w-full" onClick={confirmImport}>Sí, reemplazar mis datos</button>
            <button className="pill-ghost w-full mt-2" onClick={() => setPending(null)}>Cancelar</button>
          </>
        )}
      </Sheet>
    </Card>
  );
}
