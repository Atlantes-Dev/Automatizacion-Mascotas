import React from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import CuentasScreen from '../views/CuentasScreen';
import GruposScreen from '../views/GruposScreen';
import MascotasScreen from '../views/MascotasScreen';
import ExtraccionScreen from '../views/ExtraccionScreen';

const SCREENS = [
  { path: '/cuentas',   Component: CuentasScreen },
  { path: '/grupos',    Component: GruposScreen },
  { path: '/mascotas',  Component: MascotasScreen },
  { path: '/extraccion', Component: ExtraccionScreen },
];

const Layout: React.FC = () => {
  const location = useLocation();

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden bg-neutral-900">
        <div className="flex-1 overflow-hidden relative min-h-0">
          {SCREENS.map(({ path, Component }) => (
            <div
              key={path}
              className="absolute inset-0 overflow-hidden"
              style={{ display: location.pathname === path ? 'block' : 'none' }}
            >
              <Component />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Layout;
