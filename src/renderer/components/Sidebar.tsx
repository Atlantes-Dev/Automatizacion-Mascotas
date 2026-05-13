import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from './ThemeContext';

const navItems = [
  {
    to: '/cuentas',
    label: 'Cuentas',
    icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  },
  {
    to: '/grupos',
    label: 'Grupos',
    icon: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  },
  {
    to: '/mascotas',
    label: 'Mascotas',
    icon: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
  },
  {
    to: '/extraccion',
    label: 'Extracción',
    icon: 'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z',
  },
];

const Sidebar: React.FC = () => {
  const { theme, toggle } = useTheme();
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion);
  }, []);

  return (
    <aside className="w-52 h-full flex flex-col bg-neutral-900 border-r border-neutral-700/40 overflow-hidden flex-shrink-0">
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-neutral-700/40">
        <div className="w-7 h-7 rounded-lg bg-accent-500/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-accent-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C9.243 2 7 4.243 7 7c0 1.31.512 2.5 1.343 3.385C6.93 11.18 6 12.745 6 14.5 6 17.538 8.462 20 11.5 20S17 17.538 17 14.5c0-1.755-.93-3.32-2.343-4.115C15.488 9.5 16 8.31 16 7c0-2.757-2.243-5-5-5h1z" />
          </svg>
        </div>
        <div>
          <h1 className="text-sm font-semibold text-neutral-100 leading-none">Mascotas</h1>
          <p className="text-[9px] text-neutral-500 mt-0.5">Recopilador</p>
        </div>
      </div>

      <nav className="flex-1 py-3 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg mb-0.5 transition-all ${
                isActive
                  ? 'text-white bg-accent-600/80 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
              }`
            }
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            <span className="text-[13px]">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-neutral-700/40 flex items-center justify-between">
        <span className="text-[10px] text-neutral-600">{appVersion ? `v${appVersion}` : ''}</span>
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60 transition-all"
        >
          {theme === 'dark' ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75 9.75 9.75 0 0 1 8.25 6c0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 12c0 5.385 4.365 9.75 9.75 9.75 4.774 0 8.767-3.44 9.727-7.998" />
            </svg>
          )}
          <span className="text-[10px] font-medium">
            {theme === 'dark' ? 'Claro' : 'Oscuro'}
          </span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
