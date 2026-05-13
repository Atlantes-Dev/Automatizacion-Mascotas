import { chromium, BrowserContext, Page } from 'playwright-core';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { getDb } from '../../database';
import { randomDelay, safeGoto, randomViewport, randomUserAgent, getStealthScript } from './helpers';
import { extractGroupsComplete } from './groupExtractor';
import { getBrowserExecutablePath } from './chromium';

export async function runLoginFlow(): Promise<{
  success: boolean;
  accountId?: number;
  name?: string;
  groupsCount?: number;
  error?: string;
}> {
  try {
    const execPath = getBrowserExecutablePath();
    if (!execPath) {
      return { success: false, error: 'No se encontró ningún navegador instalado (Chrome, Edge o Brave).' };
    }

    const ua = randomUserAgent();
    console.log('[loginFlow] User-Agent:', ua);
    const tempId = `tmp_${Date.now()}`;
    const tempDir = path.join(app.getPath('userData'), 'profiles', tempId);

    const context: BrowserContext = await chromium.launchPersistentContext(tempDir, {
      headless: false,
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

    const existingPages = context.pages();
    const page: Page = existingPages.length > 0 ? existingPages[0] : await context.newPage();
    const boundSafeGoto = (url: string, timeout?: number) => safeGoto(page, url, timeout);

    console.log('[loginFlow] Abriendo página de login...');
    await page.goto('https://www.facebook.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const blockedPaths = ['/login', '/checkpoint', '/security', '/recover', '/two_step', '/help'];
    await page.waitForURL(
      (url) => {
        const href = url.href;
        if (!href.startsWith('https://www.facebook.com')) return false;
        const pathname = url.pathname;
        return !blockedPaths.some((p) => pathname.startsWith(p));
      },
      { timeout: 600000 }
    );

    console.log('[loginFlow] Verificando sesión...');
    const authDeadline = Date.now() + 300000;
    while (true) {
      const currentUrl = page.url();
      const currentPathname = new URL(currentUrl).pathname;
      if (blockedPaths.some((p) => currentPathname.startsWith(p))) {
        await page.waitForTimeout(randomDelay());
        continue;
      }

      const allCookies = await context.cookies();
      const cookieNames = allCookies.map((c) => c.name);
      if (cookieNames.includes('c_user') && cookieNames.includes('xs')) {
        console.log('[loginFlow] Sesión confirmada por cookies.');
        break;
      }

      const domLoggedIn = await page.evaluate(() => {
        const hasLoginForm = !!(document.querySelector('#email') || document.querySelector('#pass'));
        const hasNavBar = !!(
          document.querySelector('[role="navigation"]') ||
          document.querySelector('[aria-label="Facebook"]')
        );
        return !hasLoginForm && hasNavBar;
      }).catch(() => false);

      if (domLoggedIn) {
        console.log('[loginFlow] Sesión confirmada por DOM.');
        break;
      }

      if (Date.now() > authDeadline) {
        await context.close();
        return { success: false, error: 'No se pudo confirmar la sesión (timeout).' };
      }
      await page.waitForTimeout(randomDelay());
    }

    await page.waitForTimeout(randomDelay());
    const cookies = await context.cookies();
    const cookiesJson = JSON.stringify(cookies);

    let userName = 'Usuario Facebook';
    let userAvatar = '';

    try {
      await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded', timeout: 60000 });
      try { await page.waitForSelector('h1', { timeout: 10000 }); } catch { /* continuar */ }
      await page.waitForTimeout(randomDelay(2000, 4000));

      const profileData = await page.evaluate((): { name: string; avatar: string } => {
        let name = '';
        let avatar = '';

        const UI_TEXTS = new Set([
          'notificaciones', 'notifications', 'facebook', 'messenger',
          'inicio', 'home', 'watch', 'marketplace', 'grupos', 'groups',
          'gaming', 'menú', 'menu', 'crear', 'create', 'buscar', 'search',
        ]);

        const h1s = Array.from(document.querySelectorAll('h1'));
        for (const h1 of h1s) {
          const text = h1.textContent?.trim() || '';
          if (text.length < 2 || text.length > 80) continue;
          if (UI_TEXTS.has(text.toLowerCase())) continue;
          const inNav = h1.closest('[role="banner"], [role="navigation"], header');
          if (inNav) continue;
          name = text;
          break;
        }

        if (!name) {
          const og = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
          if (og?.content && og.content !== 'Facebook') {
            name = og.content.replace(/\s*[|·–—].*$/, '').trim();
          }
        }

        const imgs = Array.from(document.querySelectorAll('img[src*="fbcdn"]')) as HTMLImageElement[];
        let bestArea = 0;
        for (const img of imgs) {
          const rect = img.getBoundingClientRect();
          if (rect.width < 80 || rect.width > 250) continue;
          const ratio = rect.width / (rect.height || 1);
          if (ratio < 0.7 || ratio > 1.4) continue;
          const area = rect.width * rect.height;
          if (area > bestArea) { bestArea = area; avatar = img.src; }
        }

        return { name, avatar };
      });

      if (profileData.name) userName = profileData.name;
      if (profileData.avatar) userAvatar = profileData.avatar;
      console.log('[loginFlow] Perfil extraído →', userName);
    } catch (err: any) {
      console.error('[loginFlow] Error extrayendo perfil:', err.message);
    }

    const db = getDb();
    const accountResult = db
      .prepare('INSERT INTO accounts (name, avatar, cookies) VALUES (?, ?, ?)')
      .run(userName, userAvatar, cookiesJson);
    const accountId = accountResult.lastInsertRowid as number;

    const realDir = path.join(app.getPath('userData'), 'profiles', `account_${accountId}`);
    try { fs.renameSync(tempDir, realDir); } catch { /* ignorar */ }

    console.log('[loginFlow] Extrayendo grupos personales...');
    let groupsCount = 0;
    try {
      const personalGroups = await extractGroupsComplete(
        page,
        'https://www.facebook.com/groups/joins/?nav_source=tab&ordering=viewer_added',
        boundSafeGoto
      );
      console.log(`[loginFlow] Grupos extraídos: ${personalGroups.length}`);

      const insertGroup = db.prepare(
        'INSERT INTO groups (account_id, name, url, monitored) VALUES (?, ?, ?, 0)'
      );
      const seen = new Set<string>();
      for (const g of personalGroups) {
        if (!seen.has(g.url)) {
          insertGroup.run(accountId, g.name, g.url);
          seen.add(g.url);
          groupsCount++;
        }
      }
    } catch (err: any) {
      console.error('[loginFlow] Error extrayendo grupos:', err.message);
    }

    await context.close();
    return { success: true, accountId, name: userName, groupsCount };
  } catch (error: any) {
    console.error('[loginFlow] Error fatal:', error.message);
    try {
      const tempBase = path.join(app.getPath('userData'), 'profiles');
      const entries = fs.readdirSync(tempBase).filter((e) => e.startsWith('tmp_'));
      for (const e of entries) {
        fs.rmSync(path.join(tempBase, e), { recursive: true, force: true });
      }
    } catch { /* ignorar */ }
    return { success: false, error: error.message };
  }
}
