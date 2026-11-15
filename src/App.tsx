import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Logo } from './components/Logo';
import { Screen } from './components/ui';
import { BRAND } from './config/brand';
import { ensureSeeded } from './db/repo';

function Placeholder({ title }: { title: string }) {
  return (
    <Screen title={title}>
      <p className="text-muted">En construcción.</p>
    </Screen>
  );
}

function Splash({ error }: { error?: string }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-bg">
      <Logo size={96} />
      <p className="text-[13px] font-semibold tracking-[0.3em] text-muted">{BRAND.name}</p>
      {error && <p className="text-sm text-muted px-8 text-center">{error}</p>}
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
      <Routes>
        <Route path="/" element={<Navigate to="/hoy" replace />} />
        <Route path="/hoy" element={<Placeholder title="Hoy" />} />
        <Route path="/habitos" element={<Placeholder title="Hábitos" />} />
        <Route path="/diario" element={<Placeholder title="Diario" />} />
        <Route path="/stats" element={<Placeholder title="Estadísticas" />} />
        <Route path="/mas" element={<Placeholder title="Más" />} />
        <Route path="*" element={<Navigate to="/hoy" replace />} />
      </Routes>
      <BottomNav />
    </HashRouter>
  );
}
