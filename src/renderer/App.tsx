import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { ThemeProvider } from './components/ThemeContext';
import WelcomeScreen from './views/WelcomeScreen';

type AppState = 'loading' | 'no-chromium' | 'ready';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('loading');

  useEffect(() => {
    async function init() {
      const chromium = await window.api.checkChromium();
      setAppState(chromium.installed ? 'ready' : 'no-chromium');
    }
    init().catch((err) => {
      console.error('[App] Error en init:', err);
      setAppState('no-chromium');
    });
  }, []);

  if (appState === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-900">
        <span className="text-neutral-400 text-sm">Cargando...</span>
      </div>
    );
  }

  if (appState === 'no-chromium') {
    return (
      <ThemeProvider>
        <WelcomeScreen onComplete={() => setAppState('ready')} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/cuentas" replace />} />
          <Route path="/*" element={<Layout />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
};

export default App;
