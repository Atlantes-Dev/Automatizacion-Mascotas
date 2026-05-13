import React, { useState } from 'react';

interface Props {
  onComplete: () => void;
}

const WelcomeScreen: React.FC<Props> = ({ onComplete }) => {
  const [checking, setChecking] = useState(false);

  const retry = async () => {
    setChecking(true);
    const result = await window.api.checkChromium();
    setChecking(false);
    if (result.installed) onComplete();
  };

  return (
    <div className="h-full flex items-center justify-center bg-neutral-900 px-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent-500/20 mx-auto mb-5 flex items-center justify-center">
          <svg className="w-8 h-8 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-neutral-100 mb-2">
          Navegador no encontrado
        </h1>
        <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
          Para funcionar, esta aplicación necesita Chrome, Edge o Brave instalado en tu computadora.
          Instala uno de estos navegadores y vuelve a intentar.
        </p>

        <div className="flex flex-col gap-3 mb-4">
          <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer"
             className="text-sm text-accent-400 hover:text-accent-300 underline">
            Descargar Google Chrome
          </a>
          <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer"
             className="text-sm text-accent-400 hover:text-accent-300 underline">
            Descargar Microsoft Edge
          </a>
        </div>

        <button
          onClick={retry}
          disabled={checking}
          className="px-5 py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {checking ? 'Verificando...' : 'Volver a verificar'}
        </button>
      </div>
    </div>
  );
};

export default WelcomeScreen;
