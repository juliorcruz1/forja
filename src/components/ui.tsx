import { Check, ChevronLeft, X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LogStatus } from '../db/types';

export function Screen({
  title, subtitle, right, back, children,
}: { title: string; subtitle?: string; right?: ReactNode; back?: boolean | string; children: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="safe-top pb-nav px-4 max-w-[480px] mx-auto">
      <header className="flex items-end justify-between gap-3 pt-3 pb-4">
        <div className="flex items-end gap-1 min-w-0">
          {back && (
            <button
              className="icon-btn -ml-3 mb-0.5"
              aria-label="Volver"
              onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <div className="min-w-0">
            {subtitle && <p className="text-[13px] text-muted font-medium mb-0.5 truncate">{subtitle}</p>}
            <h1 className="text-[28px] leading-tight font-bold tracking-tight truncate">{title}</h1>
          </div>
        </div>
        {right && <div className="flex items-center gap-1 shrink-0">{right}</div>}
      </header>
      <div className="space-y-3.5">{children}</div>
    </div>
  );
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={`card p-4 animate-fadeUp ${onClick ? 'cursor-pointer active:scale-[0.99] transition' : ''} ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-3 pb-0.5 px-1">
      <h2 className="section-title">{title}</h2>
      {right}
    </div>
  );
}

/** Habit status circle: complete (violet), minimum (blue), pending (gray border), optional (dashed). */
export function StatusCircle({
  status, optional = false, onClick, size = 32, label,
}: { status: LogStatus; optional?: boolean; onClick?: () => void; size?: number; label: string }) {
  const done = status === 'done';
  const min = status === 'min';
  const rest = status === 'rest' || status === 'skipped';
  const base = 'rounded-full flex items-center justify-center shrink-0 transition';
  let cls: string;
  if (done) cls = 'bg-violet animate-pop';
  else if (min) cls = 'bg-blue animate-pop';
  else if (rest) cls = 'border-2 border-line2 bg-card2';
  else if (optional) cls = 'border-2 border-dashed border-pend';
  else cls = 'border-2 border-pend';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={label}
      aria-pressed={done || min}
      className="w-11 h-11 -m-1.5 flex items-center justify-center shrink-0"
    >
      <span className={`${base} ${cls}`} style={{ width: size, height: size }}>
        {(done || min) && <Check size={size * 0.55} strokeWidth={3} className="text-white" />}
        {rest && <span className="w-2.5 h-0.5 rounded bg-dim" />}
      </span>
    </button>
  );
}

export function ProgressRing({ pct, size = 92, stroke = 9, children }: { pct: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#4F8CFF" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#23232C" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke="url(#ringGrad)" strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Bar({ pct, color = 'violet', className = '' }: { pct: number; color?: 'violet' | 'blue'; className?: string }) {
  return (
    <div className={`h-1.5 rounded-full bg-line overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full ${color === 'violet' ? 'bg-violet' : 'bg-blue'}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, transition: 'width 500ms ease' }}
      />
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 animate-fadeUp" onClick={onClose} />
      <div
        className="relative w-full max-w-[480px] bg-card border-t border-line2 rounded-t-[24px] p-4 animate-fadeUp max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(16px + var(--safe-bottom))' }}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-line2 mb-3" />
        {title && (
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button className="icon-btn -mr-2" onClick={onClose} aria-label="Cerrar">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="min-h-[44px] flex items-center"
    >
      <span className={`w-[50px] h-[30px] rounded-full p-[3px] transition ${checked ? 'bg-violet' : 'bg-line2'}`}>
        <span className={`block w-6 h-6 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex p-1 bg-card border border-line rounded-full">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 min-h-[40px] rounded-full text-sm font-medium transition ${value === o.value ? 'bg-card2 text-ink border border-line2' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted text-center py-6 px-4">{children}</p>;
}
