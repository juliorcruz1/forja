import { Check } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { earnedLabel, MedalIcon } from '../components/MedalBits';
import { Bar, Card, Screen, SectionHeader } from '../components/ui';
import { markMedalsSeen } from '../db/repo';
import { earnedOn, FAMILY_LABEL, type Medal, type MedalFamily } from '../domain/medals';
import { useData } from '../hooks/useData';

const ORDER: MedalFamily[] = ['streak', 'habit', 'weekly', 'bad', 'perfectWeek', 'comeback', 'focus', 'level', 'care'];
/** Families shown as one row per subject with several tiers (7 · 30 · 100). */
const TIERED: MedalFamily[] = ['streak', 'habit', 'weekly', 'bad', 'focus', 'level'];

/** "Logros": every medal, earned ones bright with their date, the rest dimmed with progress. */
export function MedalsScreen() {
  const data = useData();
  const unseen = useMemo(() => new Set((data?.medalUnlocks ?? []).filter((u) => !u.seen).map((u) => u.medalId)), [data?.medalUnlocks]);
  const [freshIds] = useStateOnce(unseen);
  useEffect(() => {
    // Seen once the screen is open; the "Nueva" highlight stays for this visit.
    const t = window.setTimeout(() => markMedalsSeen(), 1200);
    return () => window.clearTimeout(t);
  }, []);
  if (!data) return null;
  const { medals, medalUnlocks, today } = data;
  const earned = medals.filter((m) => m.earned).length;

  return (
    <Screen title="Logros" subtitle={`${earned} de ${medals.length} medallas`} back>
      <p className="text-[0.8125rem] text-muted px-1">
        Salen de tus registros. Si corriges o borras un registro, la medalla se ajusta sola.
      </p>
      {ORDER.map((fam) => {
        const list = medals.filter((m) => m.family === fam);
        if (!list.length) return null;
        const groups = TIERED.includes(fam) ? groupBy(list) : list.map((m) => [m]);
        return (
          <section key={fam} className="space-y-2.5">
            <SectionHeader title={FAMILY_LABEL[fam]} />
            {groups.map((g) => (
              g.length > 1 ? (
                <TierCard key={g[0].id} medals={g} unlocks={medalUnlocks} today={today} fresh={freshIds} />
              ) : (
                <MedalCard key={g[0].id} medal={g[0]} date={earnedOn(g[0], medalUnlocks)} today={today} fresh={freshIds.has(g[0].id)} />
              )
            ))}
          </section>
        );
      })}
    </Screen>
  );
}

function useStateOnce<T>(v: T): [T] {
  // Keep the first value seen (so "Nueva" doesn't vanish when the records are marked as seen).
  return useMemo(() => [v], []); // eslint-disable-line react-hooks/exhaustive-deps
}

function groupBy(list: Medal[]): Medal[][] {
  const map = new Map<string, Medal[]>();
  for (const m of list) {
    const key = m.subject ?? m.family;
    map.set(key, [...(map.get(key) ?? []), m]);
  }
  return [...map.values()];
}

function Badge({ medal, fresh, size = 'w-11 h-11' }: { medal: Medal; fresh?: boolean; size?: string }) {
  return (
    <span
      className={`${size} rounded-xl flex items-center justify-center shrink-0 ${
        medal.earned ? 'bg-violet-soft text-violet-text' : 'bg-card2 text-dim'
      } ${fresh ? 'motion-safe:animate-pop ring-2 ring-violet' : ''}`}
    >
      <MedalIcon medal={medal} size={20} />
    </span>
  );
}

function MedalCard({ medal, date, today, fresh }: { medal: Medal; date?: string; today: string; fresh: boolean }) {
  return (
    <Card className={medal.earned ? '' : 'opacity-60'}>
      <div className="flex items-center gap-3" aria-label={`${medal.title}: ${medal.earned ? earnedLabel(date, today) : 'sin ganar'}`}>
        <Badge medal={medal} fresh={fresh} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[0.9375rem] flex items-center gap-2">
            <span className="truncate">{medal.title}</span>
            {fresh && <span className="text-[0.6875rem] text-violet-text font-medium shrink-0">Nueva</span>}
          </p>
          <p className="text-[0.75rem] text-muted">{medal.earned ? earnedLabel(date, today) : medal.description}</p>
          {!medal.earned && medal.target > 1 && (
            <div className="mt-1.5">
              <Bar pct={(medal.current / medal.target) * 100} />
              <p className="text-[0.6875rem] text-dim mt-1">{medal.current} de {medal.target} {medal.unit}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** One subject (e.g. "Lectura") with its tiers 7 · 30 · 100 and progress to the next one. */
function TierCard({ medals, unlocks, today, fresh }: { medals: Medal[]; unlocks: Parameters<typeof earnedOn>[1]; today: string; fresh: Set<string> }) {
  const next = medals.find((m) => !m.earned);
  const lastEarned = [...medals].reverse().find((m) => m.earned);
  const title = medals[0].subject ?? FAMILY_LABEL[medals[0].family];
  const anyFresh = medals.some((m) => fresh.has(m.id));
  return (
    <Card className={lastEarned ? '' : 'opacity-70'}>
      <div className="flex items-center gap-3">
        <Badge medal={lastEarned ?? medals[0]} fresh={anyFresh} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[0.9375rem] flex items-center gap-2">
            <span className="truncate">{title}</span>
            {anyFresh && <span className="text-[0.6875rem] text-violet-text font-medium shrink-0">Nueva</span>}
          </p>
          <p className="text-[0.75rem] text-muted truncate">
            {lastEarned ? `${tierLabel(lastEarned)} · ${earnedLabel(earnedOn(lastEarned, unlocks), today).toLowerCase()}` : medals[0].description}
          </p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2 mt-3">
        {medals.map((m) => (
          <li
            key={m.id}
            className={`chip ${m.earned ? 'bg-violet-soft border-violet text-violet-text' : 'border-line2 text-dim'}`}
            aria-label={`${m.title}: ${m.earned ? earnedLabel(earnedOn(m, unlocks), today) : `llevas ${m.current} de ${m.target}`}`}
          >
            {m.earned && <Check size={13} strokeWidth={3} />}
            {tierLabel(m)}
          </li>
        ))}
      </ul>
      {next && (
        <div className="mt-3">
          <Bar pct={(next.current / next.target) * 100} />
          <p className="text-[0.6875rem] text-dim mt-1">
            Siguiente: {tierLabel(next)} · tu mejor marca: {next.current} de {next.target}
          </p>
        </div>
      )}
    </Card>
  );
}

function tierLabel(m: Medal) {
  if (m.family === 'level') return m.title.replace('Nivel ', '');
  if (m.family === 'weekly' && m.target === 1) return '1.ª semana';
  const short: Record<string, string> = { días: 'días', semanas: 'sem', horas: 'h' };
  return `${m.target} ${short[m.unit] ?? m.unit}`;
}
