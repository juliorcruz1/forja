import { CalendarCheck, ClipboardList, CloudUpload, Dumbbell, Flame, Gem, RotateCcw, ShieldCheck, Target, Timer, Trophy, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { markMedalsSeen } from '../db/repo';
import { earnedOn, type Medal, type MedalFamily, unseenMedals } from '../domain/medals';
import { useData } from '../hooks/useData';
import { type DateKey, formatShort } from '../lib/dates';

export function MedalIcon({ medal, size = 18 }: { medal: Pick<Medal, 'family' | 'id'>; size?: number }) {
  const map: Record<MedalFamily, typeof Flame> = {
    streak: Flame, habit: Target, bad: ShieldCheck, weekly: Dumbbell, perfectWeek: CalendarCheck, focus: Timer,
    comeback: RotateCcw, care: medal.id.startsWith('backup') ? CloudUpload : ClipboardList, level: Gem,
  };
  const Icon = map[medal.family] ?? Trophy;
  return <Icon size={size} />;
}

export function earnedLabel(d: DateKey | undefined, today: DateKey) {
  if (!d) return '';
  return `Ganado el ${formatShort(d)}${d.slice(0, 4) !== today.slice(0, 4) ? ` ${d.slice(0, 4)}` : ''}`;
}

/** Discreet Inicio notice when a medal was just earned. */
export function MedalNotice() {
  const { medals, medalUnlocks, today } = useData()!;
  const fresh = unseenMedals(medals, medalUnlocks);
  if (fresh.length === 0) return null;
  const latest = [...fresh].sort((a, b) => (earnedOn(b, medalUnlocks) ?? '').localeCompare(earnedOn(a, medalUnlocks) ?? ''))[0];
  return (
    <div className="card p-3 flex items-center gap-3" data-testid="medal-notice">
      <span className="w-10 h-10 rounded-xl bg-violet-soft text-violet-text flex items-center justify-center shrink-0 motion-safe:animate-pop">
        <MedalIcon medal={latest} />
      </span>
      <Link to="/logros" className="flex-1 min-w-0 min-h-[44px] flex flex-col justify-center">
        <span className="text-[0.875rem] font-semibold truncate">
          {fresh.length === 1 ? `Nueva medalla: ${latest.title}` : `${fresh.length} medallas nuevas`}
        </span>
        <span className="text-[0.75rem] text-muted truncate">
          {fresh.length === 1 ? earnedLabel(earnedOn(latest, medalUnlocks), today) : `La más reciente: ${latest.title}`}
        </span>
      </Link>
      <button className="icon-btn -mr-2 shrink-0" aria-label="Ocultar aviso de medalla" onClick={() => markMedalsSeen()}>
        <X size={17} />
      </button>
    </div>
  );
}
