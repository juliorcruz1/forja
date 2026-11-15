import { dayProgress } from '../domain/habits';
import { dailyLine, greeting } from '../domain/greeting';
import { nightInfo } from '../domain/sleep';
import { useData } from '../hooks/useData';
import { useNow } from '../hooks/useNow';
import { weekday } from '../lib/dates';

/** "Buenas tardes, {nombre}" + a short, rotating line for the moment of the day. */
export function GreetingCard() {
  const { settings, habits, idx, today, points } = useData()!;
  const now = useNow(60000);
  const prog = dayProgress(habits, today, idx, today);
  const work = settings.work[weekday(today)];
  const night = nightInfo(settings, today);
  const line = dailyLine({
    date: today,
    hour: now.getHours(),
    total: prog.total,
    done: prog.done,
    missing: prog.missing.map((h) => h.name),
    isWorkDay: !!work && !work.off,
    workStart: work?.start,
    pointsToday: points.today?.net ?? 0,
    bedtime: night.bedtime,
    criticalNight: night.critical,
    nextStart: night.nextStart,
  });
  return (
    <div className="px-1 -mt-1">
      <p className="text-[22px] font-semibold leading-tight">{greeting(now, settings.userName)}</p>
      <p className="text-[14px] text-muted mt-1">{line}</p>
    </div>
  );
}
