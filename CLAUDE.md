# Automatización Mascotas

## Resumen del proyecto

Aplicación de escritorio (Electron) para una clienta que es miembro de grupos de Facebook donde se publica información sobre **mascotas extraviadas**. La app:

1. Inicia sesión en Facebook con su(s) cuenta(s).
2. Detecta automáticamente los grupos a los que pertenece esa cuenta.
3. La clienta marca qué grupos quiere monitorear.
4. La app recorre periódicamente esos grupos extrayendo los posts (texto, imágenes, autor, URL, fecha).
5. Filtra automáticamente los posts que parecen ser sobre mascotas perdidas (por palabras clave).
6. Guarda todo en una base de datos local SQLite para que la clienta los revise, marque como contactados, etc.

**No publica nada.** Solo lee y recopila. Esto la diferencia de Looping (la app hermana).

## Origen del código

Este proyecto se construyó tomando como base **Looping** (`C:\Users\KALETH\OneDrive\Documents\Atlantes\Looping`), una app de auto-publicación en Facebook. Se reutilizaron:

- **Toda la infraestructura de Electron**: ventana, IPC, preload con `contextBridge`.
- **Sistema anti-detección de Playwright**: helpers (UA dinámico, viewport aleatorio, stealth script, delays humanizados), `chromium.ts` (detección de Chrome/Edge/Brave instalado), `sessionKeepAlive.ts` (renovación periódica de cookies cada 6h), `profileLock.ts`.
- **`loginFlow.ts`**: adaptado — Looping detecta páginas + cambia de identidad para cada una; aquí **solo se extraen los grupos del perfil personal** (sin identitySwitcher).
- **`groupExtractor.ts`**: idéntico a Looping. Extrae grupos de `/groups/joins/` parseando GraphQL + scroll infinito + fallback de fetch directo a la URL del grupo para resolver nombres faltantes.
- **UI base**: ThemeContext (light/dark), Sidebar/Layout, paleta de colores (variables CSS `--neutral-*`, `--accent-*`), Tailwind config.

**No se trajeron** de Looping:
- Sistema de licencias (la app es de uso interno por ahora).
- Motor de publicación (`publishing/`) ni `composer.ts` (no publicamos).
- `identitySwitcher.ts` (no cambiamos de identidad).
- Sistema de actualizaciones, ofuscación bytecode (`bytenode`), `webpack-obfuscator` (no por ahora).
- Vistas de Looping (Posts, Programados, Historial, etc.).

## Estructura

```
Automatizacion-Mascotas/
├── src/
│   ├── main/                         # Proceso Electron principal (Node)
│   │   ├── index.ts                  # Entry: crea ventana, registra IPC, inicia keepAlive
│   │   ├── database.ts               # Init SQLite + crea tablas (accounts, groups, pets, extraction_runs, settings)
│   │   └── ipc/
│   │       ├── accounts.ts           # CRUD de cuentas de Facebook
│   │       ├── groups.ts             # CRUD + monitoreo de grupos
│   │       ├── pets.ts               # CRUD de mascotas recopiladas + conteos
│   │       ├── extraction.ts         # Motor de extracción: recorre grupos monitoreados, ejecuta postsExtractor, guarda pets
│   │       ├── playwright.ts         # Handler `playwright:openLogin` y `checkChromium`
│   │       ├── settings.ts           # Settings genéricos + config de extracción
│   │       └── playwright/
│   │           ├── chromium.ts       # Detecta Chrome/Edge/Brave instalado en Windows
│   │           ├── helpers.ts        # Delays, UA dinámico, viewport, stealth script, safeGoto
│   │           ├── loginFlow.ts      # Abre browser, espera login manual, extrae grupos del perfil personal
│   │           ├── groupExtractor.ts # Parsing GraphQL + scroll de /groups/joins/
│   │           ├── postsExtractor.ts # NUEVO: recorre el feed de un grupo y extrae posts con keywords de mascotas
│   │           ├── sessionKeepAlive.ts # Cada 6h refresca cookies de cada cuenta para no perder sesión
│   │           └── profileLock.ts    # Set<number> de accountIds ocupados (evita 2 browsers en mismo perfil)
│   ├── preload/
│   │   └── preload.ts                # Expone `window.api` con contextBridge — fuente de tipos para el renderer
│   └── renderer/                     # Proceso renderer (React + Webpack)
│       ├── index.html
│       ├── index.tsx
│       ├── App.tsx                   # Verifica Chromium → muestra Welcome o Layout
│       ├── tsconfig.json             # Config TS específica del renderer (JSX)
│       ├── styles/globals.css        # Variables CSS + reset + scrollbar
│       ├── types/electron.d.ts       # `declare global { interface Window { api: Api } }` (Api viene del preload)
│       ├── components/
│       │   ├── Layout.tsx            # Sidebar + área central con las 4 vistas (montadas y ocultas/visibles)
│       │   ├── Sidebar.tsx           # 4 entradas: Cuentas, Grupos, Mascotas, Extracción
│       │   ├── ThemeContext.tsx      # Dark/Light toggle
│       │   ├── ToggleSwitch.tsx      # Switch reutilizable
│       │   └── StatusBadge.tsx       # Badge para status de mascota (nuevo/revisado/contactado/descartado)
│       └── views/
│           ├── WelcomeScreen.tsx     # Mostrada si no hay Chrome/Edge/Brave
│           ├── CuentasScreen.tsx     # Lista cuentas + botón "Agregar cuenta" → abre login Facebook
│           ├── GruposScreen.tsx      # Lista grupos detectados, toggle monitoreo, filtros por cuenta/texto
│           ├── MascotasScreen.tsx    # Lista mascotas recopiladas, filtros por status, notas, cambiar status
│           └── ExtraccionScreen.tsx  # Botón iniciar/detener, progreso, logs en vivo, config avanzada
├── package.json
├── tsconfig.json                     # Config TS de main + preload (excluye renderer)
├── webpack.config.js                 # Bundle del renderer
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
└── CLAUDE.md                         # ← este archivo
```

## Stack técnico

- **Electron 41** + **React 18** + **TypeScript 5.6**
- **playwright-core 1.48** (sin binarios, usa Chrome/Edge/Brave del sistema)
- **better-sqlite3** para persistencia local
- **Tailwind 3** + variables CSS para temas
- **Webpack 5** para el bundle del renderer
- **node-cron** disponible (no usado activamente todavía — pensado para programar extracciones periódicas en el futuro)

## Flujos principales

### 1. Agregar cuenta de Facebook
`CuentasScreen` → `window.api.openLoginWindow()` → `playwright:openLogin` → `runLoginFlow()`:
1. Lanza Chromium con `launchPersistentContext` en `userData/profiles/tmp_<timestamp>`.
2. Abre `facebook.com/login`, espera hasta 10 min a que el usuario inicie sesión manualmente.
3. Confirma sesión por cookies (`c_user` + `xs`) o por DOM (sin form de login + presencia de barra de navegación).
4. Navega a `/me`, extrae nombre y avatar.
5. Inserta la cuenta en SQLite, renombra el directorio temporal a `account_<id>`.
6. Llama a `extractGroupsComplete` con `/groups/joins/?nav_source=tab&ordering=viewer_added` y guarda los grupos detectados con `monitored=0` por defecto.

### 2. Extracción de posts
`ExtraccionScreen` → `window.api.startExtraction()` → `extraction:start` → `runExtractionJob()`:
1. Lee grupos con `monitored=1` y `account.active=1` agrupados por cuenta.
2. Crea un registro en `extraction_runs`.
3. Por cada cuenta: lanza un contexto **headless** con sus cookies, recorre sus grupos uno por uno.
4. Por cada grupo: llama a `extractPostsFromGroup(page, url)` que hace scroll N veces y captura `[role="article"]` con texto, autor, URL, imágenes, fecha.
5. Filtra por keywords de mascotas perdidas (configurable).
6. Inserta con `INSERT OR IGNORE` (la `post_url` es UNIQUE → no se duplican posts entre ejecuciones).
7. Espera entre 8-20 segundos entre grupos (configurable, randomizado).
8. Eventos IPC en vivo: `extraction:status`, `extraction:progress`, `extraction:finished`.

### 3. Mantenimiento de sesiones
`startSessionKeepAlive()` se lanza en `app.whenReady()`:
- Primera ejecución a los 30 min de arrancar, luego cada 6h.
- Por cada cuenta, abre un browser headless, navega a `facebook.com`, espera 3-5s y guarda las cookies refrescadas.
- Si la sesión ya expiró o el browser de la cuenta está en uso (`activeProfiles` set), se salta.

## Base de datos

`%APPDATA%\automatizacion-mascotas\mascotas.db` (WAL mode, FK enabled). Tablas:

- **`accounts`** — `id, name, avatar, cookies (JSON), created_at, active`
- **`groups`** — `id, account_id, name, url, monitored, last_scanned_at` — UNIQUE(account_id, url)
- **`pets`** — `id, group_id, post_url (UNIQUE), author_name, author_url, text, images (JSON), published_at, collected_at, status (nuevo/revisado/contactado/descartado), notes`
- **`extraction_runs`** — `id, started_at, finished_at, groups_total, groups_done, posts_found, status (running/completed/failed/stopped)`
- **`settings`** — `key, value` — actualmente: `max_scrolls_per_group`, `only_lost_pets`, `delay_between_groups_min/max`

## Scripts npm

```bash
npm install              # instala dependencias + electron-rebuild para better-sqlite3
npm run dev              # build main + renderer, luego inicia electron
npm run start            # alias de dev
npm run build            # build main + renderer (producción)
npm run pack             # electron-builder --dir (carpeta sin instalador)
npm run dist             # genera instalador NSIS en release/
```

## Convenciones / cosas a tener en cuenta

- **No publica nada en Facebook.** Solo lee. Si se pide agregar funcionalidad de publicación, traer del código de Looping (`publishing/`, `composer.ts`).
- **UI en español.** Todos los textos visibles al usuario están en español.
- **Solo Windows** por ahora. Las rutas de detección de Chrome en `chromium.ts` son específicas de Windows.
- **Anti-detección crítica.** Cualquier cambio en `helpers.ts` (UA, viewport, stealth) o en `loginFlow.ts` debe mantener los flags `--disable-blink-features=AutomationControlled` + `ignoreDefaultArgs: ['--enable-automation']`. Cambiar esto puede hacer que Facebook detecte el bot.
- **Selectores frágiles.** Facebook cambia su DOM con frecuencia. `groupExtractor.ts` y `postsExtractor.ts` mezclan parsing de GraphQL (estable) con scraping DOM (frágil). Si dejan de funcionar, revisar primero los selectores de `[role="article"]`, `[data-ad-preview="message"]`, los `h1/h2/h3` para autores, etc.
- **Keywords de mascotas** están hardcodeadas en `postsExtractor.ts` (`PET_KEYWORDS`). Si la clienta quiere agregar/quitar palabras, editar ese array.
- **El renderer no puede importar nada del main directamente.** Toda comunicación pasa por `window.api` (definido en `preload.ts`). Los tipos se infieren automáticamente desde `Api` exportado del preload.
- **Cuando agregues un nuevo handler IPC**: (1) crearlo en `src/main/ipc/*.ts`, (2) registrarlo en `src/main/index.ts`, (3) exponerlo en `src/preload/preload.ts`. El renderer obtiene tipos automáticamente.

## Para retomar trabajo

Si vas a continuar este proyecto y no recuerdas el contexto:
1. Lee este CLAUDE.md.
2. La clienta usa una sola cuenta (probablemente). Validar que el flujo multi-cuenta funciona correctamente.
3. Falta: programar extracciones periódicas (existe `node-cron` instalado). Cuando se haga, usar `extraction:start` desde un cron.
4. Falta: exportar mascotas a CSV/Excel para gestión externa.
5. Considerar agregar deduplicación por similaridad de imagen + texto (no solo por `post_url`, ya que el mismo post a veces aparece compartido en varios grupos).
6. La carpeta `assets/` con `icon.ico` no existe todavía; al construir, Electron usa el icono por defecto. Agregar uno antes del primer `npm run dist`.
