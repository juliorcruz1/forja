import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Logo } from './components/Logo';
import { BRAND } from './config/brand';
import { ensureSeeded } from './db/repo';
import { DataProvider, useData } from './hooks/useData';
import { BadHabitFormScreen } from './screens/BadHabitForm';
import { HabitDetailScreen } from './screens/HabitDetail';
import { HabitFormScreen } from './screens/HabitForm';
import { HabitsScreen } from './screens/Habits';
import { TodayScreen } from './screens/Today';
import { StatsScreen } from './screens/Stats';
import { MoreScreen } from './screens/More';
import { SettingsScreen } from './screens/Settings';
import { WeeklyReviewScreen } from './screens/WeeklyReview';
import { JournalHistoryScreen, JournalScreen } from './screens/Journal';

function Splash({ error }: { error?: string }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-bg">
      <Logo size={96} />
      <p className="text-[13px] font-semibold tracking-[0.3em] text-muted">{BRAND.name}</p>
      {error && <p className="text-sm text-muted px-8 text-center">{error}</p>}
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.getElementById('scroll-root')?.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppRoutes() {
  const data = useData();
  if (!data) return <Splash />;
  return (
    <div className="app-shell">
      <ScrollToTop />
      <main id="scroll-root" className="app-main">
      <Routes>
        <Route path="/" element={<Navigate to="/hoy" replace />} />
        <Route path="/hoy" element={<TodayScreen />} />
        <Route path="/habitos" element={<HabitsScreen />} />
        <Route path="/habitos/nuevo" element={<HabitFormScreen />} />
        <Route path="/habitos/:id" element={<HabitDetailScreen />} />
        <Route path="/habitos/:id/editar" element={<HabitFormScreen />} />
        <Route path="/malos/nuevo" element={<BadHabitFormScreen />} />
        <Route path="/malos/:id/editar" element={<BadHabitFormScreen />} />
        <Route path="/diario" element={<JournalScreen />} />
        <Route path="/diario/historial" element={<JournalHistoryScreen />} />
        <Route path="/diario/:date" element={<JournalScreen />} />
        <Route path="/stats" element={<StatsScreen />} />
        <Route path="/mas" element={<MoreScreen />} />
        <Route path="/ajustes" element={<SettingsScreen />} />
        <Route path="/revision" element={<WeeklyReviewScreen />} />
        <Route path="/revision/:week" element={<WeeklyReviewScreen />} />
        <Route path="*" element={<Navigate to="/hoy" replace />} />
      </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    ensureSeeded()
      .then(() => setReady(true))
      .catch(() => setError('No se pudo abrir la base de datos local. Revisa que Safari no esté en modo privado.'));
  }, []);
  if (!ready) return <Splash error={error} />;
  return (
    <HashRouter>
      <DataProvider>
        <AppRoutes />
      </DataProvider>
    </HashRouter>
  );
}
