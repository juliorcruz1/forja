import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Logo } from './components/Logo';
import { BRAND } from './config/brand';
import { ensureSeeded, settleFocus, syncMedalUnlocks } from './db/repo';
import { medalSyncPlan } from './domain/medals';
import { MedalsScreen } from './screens/Medals';
import { PrintScreen } from './screens/Print';
import { DataProvider, useData } from './hooks/useData';
import { BadHabitFormScreen } from './screens/BadHabitForm';
import { HabitDetailScreen } from './screens/HabitDetail';
import { HabitFormScreen } from './screens/HabitForm';
import { HabitsScreen } from './screens/Habits';
import { TodayScreen } from './screens/Today';
import { StatsScreen } from './screens/Stats';
import { PointsScreen } from './screens/Points';
import { FocusScreen } from './screens/Focus';
import { UrgeScreen } from './screens/Urge';
import { CalendarScreen } from './screens/Calendar';
import { PunishScreen } from './screens/Punish';
import { MoreScreen } from './screens/More';
import { SettingsScreen } from './screens/Settings';
import { WeeklyReviewScreen } from './screens/WeeklyReview';
import { JournalHistoryScreen, JournalScreen } from './screens/Journal';

function Splash({ error }: { error?: string }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-bg">
      <Logo size={96} />
      <p className="text-[0.8125rem] font-semibold tracking-[0.3em] text-muted">{BRAND.name}</p>
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

/** Closes focus sessions that ended while the app was closed or in the background. */
function FocusSettler() {
  useEffect(() => {
    settleFocus();
    const onVis = () => {
      if (document.visibilityState === 'visible') settleFocus();
    };
    document.addEventListener('visibilitychange', onVis);
    const t = window.setInterval(() => settleFocus(), 15000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(t);
    };
  }, []);
  return null;
}

/** Keeps the stored medal unlocks in step with the derived medals. */
function MedalSync() {
  const data = useData();
  useEffect(() => {
    if (!data) return;
    const { add, remove } = medalSyncPlan(data.medals, data.medalUnlocks);
    if (add.length || remove.length) syncMedalUnlocks(add, remove);
  }, [data]);
  return null;
}

function AppRoutes() {
  const data = useData();
  if (!data) return <Splash />;
  return (
    <div className="app-shell">
      <ScrollToTop />
      <FocusSettler />
      <MedalSync />
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
        <Route path="/puntos" element={<PointsScreen />} />
        <Route path="/concentracion" element={<FocusScreen />} />
        <Route path="/ganas" element={<UrgeScreen />} />
        <Route path="/castigos" element={<PunishScreen />} />
        <Route path="/calendario" element={<CalendarScreen />} />
        <Route path="/logros" element={<MedalsScreen />} />
        <Route path="/imprimir" element={<PrintScreen />} />
        <Route path="/imprimir/:week" element={<PrintScreen />} />
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
