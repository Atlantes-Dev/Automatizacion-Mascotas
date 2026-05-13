import { chromium, BrowserContext } from 'playwright-core';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { getDb } from '../../database';
import { getBrowserExecutablePath } from './chromium';
import { randomViewport, randomUserAgent, getStealthScript } from './helpers';
import { activeProfiles } from './profileLock';

const INTERVAL_MS = 6 * 60 * 60 * 1000;
const BLOCKED_PATHS = ['/login', '/checkpoint', '/security', '/recover', '/two_step', '/help', '/ajax'];

let keepAliveTimer: ReturnType<typeof setTimeout> | null = null;

async function refreshAccountCookies(accountId: number, accountName: string): Promise<void> {
  if (activeProfiles.has(accountId)) return;

  const execPath = getBrowserExecutablePath();
  if (!execPath) return;

  let context: BrowserContext | null = null;
  try {
    activeProfiles.add(accountId);

    const profileDir = path.join(app.getPath('userData'), 'profiles', `account_${accountId}`);
    const lockFile = path.join(profileDir, 'SingletonLock');
    if (fs.existsSync(lockFile)) {
      try { fs.rmSync(lockFile); } catch { /* ignorar */ }
    }

    const ua = randomUserAgent();
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      executablePath: execPath,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        '--disk-cache-size=52428800',
        '--test-type',
      ],
      viewport: randomViewport(),
      locale: 'es-ES',
      userAgent: ua,
    });

    await context.addInitScript({ content: getStealthScript(ua) });

    const db = getDb();
    const account = db.prepare('SELECT cookies FROM accounts WHERE id = ?').get(accountId) as any;
    const existingCookies = JSON.parse(account?.cookies || '[]');
    if (existingCookies.length > 0) {
      await context.addCookies(existingCookies);
    }

    const existingPages = context.pages();
    const page = existingPages.length > 0 ? existingPages[0] : await context.newPage();
    await page.goto('https://www.facebook.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const currentUrl = page.url();
    if (BLOCKED_PATHS.some((p) => currentUrl.includes(p))) {
      console.log(`[keepAlive] Sesión de "${accountName}" expiró.`);
      await context.close();
      activeProfiles.delete(accountId);
      return;
    }

    await page.waitForTimeout(3000 + Math.floor(Math.random() * 2000));

    const newCookies = await context.cookies();
    if (newCookies.length > 0) {
      db.prepare('UPDATE accounts SET cookies = ? WHERE id = ?').run(
        JSON.stringify(newCookies),
        accountId
      );
      console.log(`[keepAlive] Cookies renovadas para "${accountName}".`);
    }

    await context.close();
    activeProfiles.delete(accountId);
  } catch (err: any) {
    try { await context?.close(); } catch { /* ignorar */ }
    activeProfiles.delete(accountId);
    console.error(`[keepAlive] Error al renovar "${accountName}":`, err.message);
  }
}

async function runKeepAlive(): Promise<void> {
  console.log('[keepAlive] Iniciando ciclo...');

  let accounts: Array<{ id: number; name: string; cookies: string }> = [];
  try {
    accounts = getDb().prepare('SELECT id, name, cookies FROM accounts').all() as any[];
  } catch (err: any) {
    console.error('[keepAlive] Error leyendo cuentas:', err.message);
    return;
  }

  for (const account of accounts) {
    const nowSecs = Math.floor(Date.now() / 1000);
    try {
      const cookies: Array<{ name: string; expires?: number }> = JSON.parse(account.cookies || '[]');
      const cUser = cookies.find((c) => c.name === 'c_user');
      const xs = cookies.find((c) => c.name === 'xs');

      if (!cUser || !xs) continue;

      const cUserExpired = cUser.expires && cUser.expires !== -1 && cUser.expires <= nowSecs;
      const xsExpired = xs.expires && xs.expires !== -1 && xs.expires <= nowSecs;
      if (cUserExpired || xsExpired) continue;
    } catch {
      continue;
    }

    await refreshAccountCookies(account.id, account.name);
    await new Promise((r) => setTimeout(r, 5000 + Math.floor(Math.random() * 5000)));
  }

  console.log('[keepAlive] Ciclo completado.');
}

export function startSessionKeepAlive(): void {
  const firstRun = setTimeout(() => {
    runKeepAlive();
    keepAliveTimer = setInterval(runKeepAlive, INTERVAL_MS);
  }, 30 * 60 * 1000);

  keepAliveTimer = firstRun as any;
  console.log('[keepAlive] Programado: primera ejecución en 30 min, luego cada 6h.');
}

export function stopSessionKeepAlive(): void {
  if (keepAliveTimer) {
    clearTimeout(keepAliveTimer);
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}
