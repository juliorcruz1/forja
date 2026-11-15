import { BarChart3, CircleCheckBig, House, Menu, NotebookPen } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/hoy', label: 'Inicio', Icon: House },
  { to: '/habitos', label: 'Hábitos', Icon: CircleCheckBig },
  { to: '/diario', label: 'Diario', Icon: NotebookPen },
  { to: '/stats', label: 'Stats', Icon: BarChart3 },
  { to: '/mas', label: 'Más', Icon: Menu },
];

export function BottomNav() {
  return (
    <nav
      className="app-nav relative z-40 bg-bg border-t border-line"
      data-testid="bottom-nav"
      aria-label="Navegación principal"
    >
      <ul className="max-w-[480px] mx-auto grid grid-cols-5">
        {TABS.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 h-[60px] text-[11px] font-medium transition ${isActive ? 'text-violet-text' : 'text-dim'}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={23} strokeWidth={isActive ? 2.2 : 1.8} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
