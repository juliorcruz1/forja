import { ChevronRight, ClipboardList, CloudUpload, Settings, Timer, Trophy, CalendarDays, HeartPulse, SmartphoneNfc, Briefcase } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Card, Screen, SectionHeader } from '../components/ui';
import { BRAND } from '../config/brand';

const SOON = [
  { label: 'Puntos y niveles', Icon: Trophy },
  { label: 'Sesiones de concentración', Icon: Timer },
  { label: 'Ventanas sin celular', Icon: SmartphoneNfc },
  { label: 'Calendario', Icon: CalendarDays },
  { label: 'Productividad', Icon: Briefcase },
  { label: 'Salud y fitness', Icon: HeartPulse },
];

export function MoreScreen() {
  return (
    <Screen title="Más">
      <Card className="flex items-center gap-4">
        <Logo size={56} />
        <div>
          <p className="font-bold tracking-[0.2em]">{BRAND.name}</p>
          <p className="text-[13px] text-muted">{BRAND.motto}</p>
        </div>
      </Card>
      <div className="card divide-y divide-line overflow-hidden">
        <Row to="/ajustes" icon={<Settings size={19} />} label="Ajustes" />
        <Row to="/revision" icon={<ClipboardList size={19} />} label="Revisión semanal" />
        <Row to="/ajustes#respaldo" icon={<CloudUpload size={19} />} label="Respaldo de datos" />
      </div>
      <SectionHeader title="Próximamente" />
      <div className="card divide-y divide-line overflow-hidden opacity-70">
        {SOON.map(({ label, Icon }) => (
          <div key={label} className="flex items-center gap-3 px-4 min-h-[52px]">
            <Icon size={19} className="text-dim" />
            <span className="flex-1 text-[15px] text-muted">{label}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-line2 text-dim">Pronto</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}

function Row({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 min-h-[52px] active:bg-card2 transition">
      <span className="text-violet-text">{icon}</span>
      <span className="flex-1 text-[15px]">{label}</span>
      <ChevronRight size={18} className="text-dim" />
    </Link>
  );
}
