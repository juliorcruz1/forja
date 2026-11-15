import {
  Bell, Briefcase, CalendarDays, ChevronRight, ClipboardList, CloudUpload, Flame, HeartHandshake, HeartPulse, Printer, Scale,
  Settings, SmartphoneNfc, Timer, Trophy,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Card, Screen, SectionHeader } from '../components/ui';
import { BRAND } from '../config/brand';

const SOON = [
  { label: 'Castigos y deudas', Icon: Scale },
  { label: 'Impresión semanal', Icon: Printer },
  { label: 'Calendario', Icon: CalendarDays },
  { label: 'Logros', Icon: Trophy },
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
          <p className="text-[0.8125rem] text-muted">{BRAND.motto}</p>
        </div>
      </Card>
      <div className="card divide-y divide-line overflow-hidden">
        <Row to="/puntos" icon={<Flame size={19} />} label="Puntos y niveles" />
        <Row to="/concentracion" icon={<Timer size={19} />} label="Concentración" />
        <Row to="/ganas" icon={<HeartHandshake size={19} />} label="Momento de ganas" />
        <Row to="/ajustes#celular" icon={<SmartphoneNfc size={19} />} label="Celular y redes" />
        <Row to="/ajustes#recordatorios" icon={<Bell size={19} />} label="Recordatorios del día" />
        <Row to="/ajustes" icon={<Settings size={19} />} label="Ajustes" />
        <Row to="/revision" icon={<ClipboardList size={19} />} label="Revisión semanal" />
        <Row to="/ajustes#respaldo" icon={<CloudUpload size={19} />} label="Respaldo de datos" />
      </div>
      <SectionHeader title="Próximamente" />
      <div className="card divide-y divide-line overflow-hidden opacity-70">
        {SOON.map(({ label, Icon }) => (
          <div key={label} className="flex items-center gap-3 px-4 min-h-[52px]">
            <Icon size={19} className="text-dim" />
            <span className="flex-1 text-[0.9375rem] text-muted">{label}</span>
            <span className="text-[0.6875rem] px-2 py-0.5 rounded-full border border-line2 text-dim">Pronto</span>
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
      <span className="flex-1 text-[0.9375rem]">{label}</span>
      <ChevronRight size={18} className="text-dim" />
    </Link>
  );
}
