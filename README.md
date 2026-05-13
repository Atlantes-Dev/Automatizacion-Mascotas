# Mascotas Extraviadas

Aplicación de escritorio (Electron) para recopilar automáticamente publicaciones sobre mascotas extraviadas en grupos de Facebook.

La app inicia sesión con tus cuentas de Facebook, detecta los grupos a los que perteneces, te deja elegir cuáles monitorear y recorre periódicamente esos grupos guardando los posts relevantes (texto, imágenes, autor, fecha, link) en una base de datos local. No publica nada — solo lee y recopila.

---

## Características

- **Login manual de Facebook** con detección automática de la sesión (cookies + DOM).
- **Detección automática de grupos** a los que pertenece cada cuenta.
- **Selección de grupos** a monitorear (toggle individual o por lote).
- **Extracción de posts** con filtro por palabras clave de mascotas extraviadas.
- **Gestión interna** de cada registro: estados (nuevo / revisado / contactado / descartado) y notas.
- **Multi-cuenta** — puedes agregar varias cuentas de Facebook.
- **Anti-detección** — User-Agent dinámico, viewport aleatorio, stealth script, delays humanizados.
- **Renovación de sesión** automática cada 6 horas en segundo plano.
- **Persistencia local** con SQLite (no se envía nada a ningún servidor externo).
- **Tema claro / oscuro**.

---

## Requisitos

- **Windows 10 / 11**
- **Node.js 20.x** (probado en 20.19.5)
- **Google Chrome**, **Microsoft Edge** o **Brave Browser** instalado (la app usa el navegador del sistema, no descarga uno propio).

---

## Instalación

```bash
git clone <url-del-repo>
cd Automatizacion-Mascotas
npm install
```

> **Nota sobre `better-sqlite3`:** Es un módulo nativo que requiere compilación. Si `npm install` falla con un error de Visual Studio, instala [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) con la carga de trabajo "Desarrollo para escritorio con C++", o usa una versión de Node con prebuilds disponibles.

---

## Uso

### Modo desarrollo

```bash
npm run dev
```

Compila el main process (TypeScript) y el renderer (Webpack), luego inicia la app.

### Modo producción

```bash
npm run build      # Compila todo a dist/
npm start          # Compila y ejecuta
```

### Generar instalador

```bash
npm run dist       # Genera instalador NSIS en release/
npm run pack       # Genera carpeta portable en release/ (sin instalador)
```

---

## Cómo usar la app

1. **Cuentas**: agrega una cuenta clickeando "Agregar cuenta". Se abrirá un navegador donde inicias sesión manualmente en Facebook. La app detectará la sesión y extraerá automáticamente la lista de grupos a los que perteneces.

2. **Grupos**: marca con el switch los grupos que quieras monitorear. Puedes filtrar por cuenta o buscar por nombre, y usar "Activar todos" / "Desactivar" para selecciones masivas.

3. **Extracción**: ve a la pestaña Extracción y presiona "Iniciar extracción". La app recorrerá cada grupo monitoreado y guardará los posts encontrados. Puedes seguir el progreso en vivo y ver el log de actividad.

4. **Mascotas**: revisa los posts recopilados. Cada uno puede cambiar de estado (nuevo → revisado → contactado / descartado) y aceptar notas internas. Puedes filtrar por estado o buscar en texto/autor/grupo.

---

## Configuración avanzada

Desde la pestaña **Extracción** puedes ajustar:

| Opción | Descripción | Default |
|---|---|---|
| Filtrar solo mascotas perdidas | Si está activo, solo guarda posts cuyo texto contiene palabras clave de mascotas extraviadas. | Sí |
| Scrolls máximos por grupo | Cuántas veces se hace scroll en el feed antes de pasar al siguiente grupo. | 15 |
| Pausa entre grupos | Rango (en segundos) de espera aleatoria entre cada grupo, para evitar detección. | 8 a 20 |

Las palabras clave de mascotas se definen en [`src/main/ipc/playwright/postsExtractor.ts`](src/main/ipc/playwright/postsExtractor.ts) en el array `PET_KEYWORDS`. Edítalo si quieres ajustar el filtro.

---

## Stack técnico

- **Electron 41** + **React 18** + **TypeScript 5.6**
- **playwright-core 1.48** (sin binarios — usa Chrome/Edge/Brave del sistema)
- **better-sqlite3** para persistencia local
- **Tailwind CSS 3** con variables CSS para temas
- **Webpack 5** para el bundle del renderer
- **node-cron** disponible para extracciones programadas (no usado activamente todavía)

---

## Estructura del proyecto

```
src/
├── main/                         # Proceso principal (Node)
│   ├── index.ts                  # Bootstrap: ventana, IPC, keepAlive
│   ├── database.ts               # Init SQLite + creación de tablas
│   └── ipc/
│       ├── accounts.ts           # CRUD de cuentas
│       ├── groups.ts             # CRUD + monitoreo de grupos
│       ├── pets.ts               # CRUD de mascotas + conteos
│       ├── extraction.ts         # Motor de extracción
│       ├── playwright.ts         # Login + check Chromium
│       ├── settings.ts           # Configuración persistente
│       └── playwright/
│           ├── chromium.ts       # Detección de browser instalado
│           ├── helpers.ts        # Anti-detección + delays
│           ├── loginFlow.ts      # Flujo de login
│           ├── groupExtractor.ts # Extracción de grupos
│           ├── postsExtractor.ts # Extracción de posts
│           ├── sessionKeepAlive.ts
│           └── profileLock.ts
├── preload/preload.ts            # API tipada window.api
└── renderer/                     # React UI
    ├── App.tsx
    ├── components/               # Layout, Sidebar, ThemeContext, etc.
    └── views/                    # Welcome, Cuentas, Grupos, Mascotas, Extracción
```

---

## Base de datos

Se almacena en `%APPDATA%\automatizacion-mascotas\mascotas.db`. Las tablas son:

- `accounts` — cuentas de Facebook + cookies
- `groups` — grupos detectados, con flag de monitoreo
- `pets` — posts recopilados (única por `post_url`)
- `extraction_runs` — historial de ejecuciones de extracción
- `settings` — preferencias del usuario

Los perfiles persistentes de Chromium (con la sesión activa de cada cuenta) se guardan en `%APPDATA%\automatizacion-mascotas\profiles\account_<id>\`.

---

## Privacidad

- Todos los datos se guardan **localmente** en tu computadora.
- La app no se comunica con ningún servidor externo (no hay telemetría, no hay sincronización en la nube).
- Las cookies de sesión de Facebook se almacenan en la base de datos local y en el perfil persistente de Chromium.
- Para eliminar una cuenta y todos sus datos, usa el botón de eliminar en la pestaña Cuentas.

---

## Limitaciones conocidas

- **Solo Windows** por ahora. Las rutas de detección de Chrome son específicas de Windows.
- Los selectores DOM de Facebook **pueden cambiar**. Si la extracción deja de funcionar, probablemente sea necesario actualizar los selectores en `groupExtractor.ts` o `postsExtractor.ts`.
- Facebook tiene rate limiting agresivo. Si extraes demasiados grupos en poco tiempo desde la misma cuenta, puede que pidan verificación. Los delays están configurados conservadoramente por esto.
- La detección de "post sobre mascota perdida" se basa en palabras clave simples. No es perfecta — habrá falsos positivos y falsos negativos.

---

## Licencia

Uso interno / propietario.
