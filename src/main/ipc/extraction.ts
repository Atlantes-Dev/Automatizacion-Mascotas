import { IpcMain, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { chromium, BrowserContext } from 'playwright-core';
import { getDb } from '../database';
import { getBrowserExecutablePath } from './playwright/chromium';
import { randomViewport, randomUserAgent, getStealthScript, randomDelay } from './playwright/helpers';
import { activeProfiles } from './playwright/profileLock';
import { extractPostsFromGroup } from './playwright/postsExtractor';

interface ExtractionState {
  runId: number | null;
  running: boolean;
  shouldStop: boolean;
}

const state: ExtractionState = {
  runId: null,
  running: false,
  shouldStop: false,
};

function emit(channel: string, payload: any): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, payload);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runExtractionJob(): Promise<void> {
  const db = getDb();

  const groups = db
    .prepare(`
      SELECT g.id, g.account_id, g.name, g.url, a.cookies
      FROM groups g
      JOIN accounts a ON a.id = g.account_id
      WHERE g.monitored = 1 AND a.active = 1
      ORDER BY g.account_id, g.name
    `)
    .all() as Array<{ id: number; account_id: number; name: string; url: string; cookies: string }>;

  if (groups.length === 0) {
    state.running = false;
    state.runId = null;
    emit('extraction:status', { message: 'No hay grupos monitoreados.', type: 'warn' });
    emit('extraction:finished', { found: 0 });
    return;
  }

  const runResult = db
    .prepare('INSERT INTO extraction_runs (groups_total) VALUES (?)')
    .run(groups.length);
  state.runId = runResult.lastInsertRowid as number;

  emit('extraction:status', { message: `Iniciando extracción de ${groups.length} grupo(s)...`, type: 'info' });
  emit('extraction:progress', { done: 0, total: groups.length, found: 0 });

  // Aviso de modo incremental al inicio del run (no por cada grupo).
  const incModeOn = ((db.prepare('SELECT value FROM settings WHERE key = ?').get('incremental_mode') as any)?.value || '1') === '1';
  if (incModeOn) {
    const knownTotal = (db.prepare('SELECT COUNT(*) AS c FROM pets').get() as any).c;
    emit('extraction:status', {
      message: `Modo incremental activo · ${knownTotal} post(s) conocido(s) en BD`,
      type: 'info',
    });
  }

  const cfg = {
    maxScrollsPerGroup: parseInt(
      (db.prepare('SELECT value FROM settings WHERE key = ?').get('max_scrolls_per_group') as any)?.value || '15',
      10
    ),
    onlyLostPets:
      ((db.prepare('SELECT value FROM settings WHERE key = ?').get('only_lost_pets') as any)?.value || '1') === '1',
    delayMin: parseInt(
      (db.prepare('SELECT value FROM settings WHERE key = ?').get('delay_between_groups_min') as any)?.value || '8',
      10
    ),
    delayMax: parseInt(
      (db.prepare('SELECT value FROM settings WHERE key = ?').get('delay_between_groups_max') as any)?.value || '20',
      10
    ),
    incrementalMode:
      ((db.prepare('SELECT value FROM settings WHERE key = ?').get('incremental_mode') as any)?.value || '1') === '1',
    incrementalStopAfter: parseInt(
      (db.prepare('SELECT value FROM settings WHERE key = ?').get('incremental_stop_after') as any)?.value || '3',
      10
    ),
  };

  const execPath = getBrowserExecutablePath();
  if (!execPath) {
    db.prepare('UPDATE extraction_runs SET status = ?, finished_at = datetime(\'now\', \'localtime\') WHERE id = ?')
      .run('failed', state.runId);
    state.running = false;
    emit('extraction:status', { message: 'No se encontró ningún navegador instalado.', type: 'error' });
    emit('extraction:finished', { found: 0 });
    return;
  }

  const insertPet = db.prepare(`
    INSERT OR IGNORE INTO pets (group_id, post_url, author_name, author_url, text, images, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const getPetIdByUrl = db.prepare(`SELECT id FROM pets WHERE post_url = ?`);
  // INSERT OR IGNORE: si un post aparece dos veces en el mismo run (por scroll duplicado),
  // solo se registra una vez gracias al PK compuesto (run_id, pet_id).
  const insertRunPost = db.prepare(`
    INSERT OR IGNORE INTO extraction_run_posts (run_id, pet_id, is_new) VALUES (?, ?, ?)
  `);
  const markGroupScanned = db.prepare(`UPDATE groups SET last_scanned_at = datetime('now', 'localtime') WHERE id = ?`);

  const groupsByAccount = new Map<number, typeof groups>();
  for (const g of groups) {
    if (!groupsByAccount.has(g.account_id)) groupsByAccount.set(g.account_id, []);
    groupsByAccount.get(g.account_id)!.push(g);
  }

  let groupsDone = 0;
  let totalFound = 0;

  for (const [accountId, accountGroups] of groupsByAccount) {
    if (state.shouldStop) break;

    if (activeProfiles.has(accountId)) {
      emit('extraction:status', { message: `Cuenta #${accountId} ocupada, saltando.`, type: 'warn' });
      continue;
    }

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

      const accountCookies = JSON.parse(accountGroups[0].cookies || '[]');
      if (accountCookies.length > 0) {
        await context.addCookies(accountCookies);
      }

      const existing = context.pages();
      const page = existing.length > 0 ? existing[0] : await context.newPage();

      for (const g of accountGroups) {
        if (state.shouldStop) break;

        emit('extraction:status', { message: `Escaneando "${g.name}"...`, type: 'info' });

        try {
          // ─── Modo incremental: pre-cargar URLs ya conocidas ───────────────────
          // Si está activo, leemos TODOS los post_url ya en BD (globales — no solo
          // del grupo actual) para que cross-group shares también se detecten como
          // conocidos. El extractor usa este Set para decidir cuándo cortar el scroll.
          // Se re-consulta por grupo para que los posts insertados entre grupos
          // anteriores ya cuenten como "conocidos" al procesar este.
          let knownUrls: Set<string> | undefined = undefined;
          if (cfg.incrementalMode) {
            const rows = db.prepare('SELECT post_url FROM pets').all() as Array<{ post_url: string }>;
            knownUrls = new Set(rows.map((r) => r.post_url));
          }

          const posts = await extractPostsFromGroup(page, g.url, {
            maxScrolls: cfg.maxScrollsPerGroup,
            onlyLostPets: cfg.onlyLostPets,
            knownUrls,
            incrementalStopAfter: cfg.incrementalStopAfter,
          });

          let saved = 0;
          for (const p of posts) {
            const r = insertPet.run(
              g.id,
              p.postUrl,
              p.authorName,
              p.authorUrl,
              p.text,
              JSON.stringify(p.images),
              p.publishedAt
            );
            const isNew = r.changes > 0;
            if (isNew) saved++;

            // Buscar el pet_id (tanto si lo acabamos de insertar como si ya existía)
            // para registrar la aparición en este run.
            const row = getPetIdByUrl.get(p.postUrl) as { id: number } | undefined;
            if (row && state.runId !== null) {
              insertRunPost.run(state.runId, row.id, isNew ? 1 : 0);
            }
          }

          markGroupScanned.run(g.id);
          totalFound += saved;

          emit('extraction:status', {
            message: `"${g.name}": ${posts.length} posts, ${saved} nuevos`,
            type: 'success',
          });
        } catch (err: any) {
          emit('extraction:status', { message: `Error en "${g.name}": ${err.message}`, type: 'error' });
        }

        groupsDone++;
        db.prepare('UPDATE extraction_runs SET groups_done = ?, posts_found = ? WHERE id = ?')
          .run(groupsDone, totalFound, state.runId);
        emit('extraction:progress', { done: groupsDone, total: groups.length, found: totalFound });

        if (!state.shouldStop) {
          const waitSec = cfg.delayMin + Math.floor(Math.random() * (cfg.delayMax - cfg.delayMin));
          await sleep(waitSec * 1000);
        }
      }

      await context.close();
      activeProfiles.delete(accountId);
    } catch (err: any) {
      try { await context?.close(); } catch { /* ignorar */ }
      activeProfiles.delete(accountId);
      emit('extraction:status', { message: `Error con cuenta #${accountId}: ${err.message}`, type: 'error' });
    }

    if (!state.shouldStop) {
      await sleep(randomDelay(3000, 6000));
    }
  }

  const finalStatus = state.shouldStop ? 'stopped' : 'completed';
  db.prepare(`UPDATE extraction_runs SET status = ?, finished_at = datetime('now', 'localtime') WHERE id = ?`)
    .run(finalStatus, state.runId);

  state.running = false;
  state.runId = null;
  state.shouldStop = false;

  emit('extraction:status', {
    message: `Extracción ${finalStatus === 'stopped' ? 'detenida' : 'completada'}. ${totalFound} mascota(s) nueva(s).`,
    type: finalStatus === 'stopped' ? 'warn' : 'success',
  });
  emit('extraction:finished', { found: totalFound });
  emit('data:changed', null);
}

export function registerExtractionHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('extraction:start', () => {
    if (state.running) {
      return { success: false, error: 'Ya hay una extracción en curso.' };
    }
    state.running = true;
    state.shouldStop = false;
    runExtractionJob().catch((err) => {
      console.error('[extraction] Error fatal:', err);
      state.running = false;
      state.shouldStop = false;
      emit('extraction:status', { message: `Error fatal: ${err.message}`, type: 'error' });
      emit('extraction:finished', { found: 0 });
    });
    return { success: true };
  });

  ipcMain.handle('extraction:stop', () => {
    if (!state.running) return { success: false, error: 'No hay extracción en curso.' };
    state.shouldStop = true;
    return { success: true };
  });

  ipcMain.handle('extraction:getState', () => {
    return { running: state.running, runId: state.runId };
  });

  ipcMain.handle('extraction:getRuns', () => {
    return getDb()
      .prepare('SELECT * FROM extraction_runs ORDER BY started_at DESC LIMIT 50')
      .all();
  });

  // Lista de recopilaciones con contadores derivados de extraction_run_posts.
  // 'posts_seen' = total de posts vistos (incluyendo repetidos de runs previos).
  // 'posts_new'  = posts que fueron nuevos en ESTE run.
  ipcMain.handle('extraction:getRunsWithStats', () => {
    return getDb()
      .prepare(`
        SELECT
          r.id,
          r.started_at,
          r.finished_at,
          r.groups_total,
          r.groups_done,
          r.posts_found,
          r.status,
          COALESCE(SUM(CASE WHEN erp.pet_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS posts_seen,
          COALESCE(SUM(CASE WHEN erp.is_new = 1 THEN 1 ELSE 0 END), 0) AS posts_new
        FROM extraction_runs r
        LEFT JOIN extraction_run_posts erp ON erp.run_id = r.id
        GROUP BY r.id
        ORDER BY r.started_at DESC
        LIMIT 100
      `)
      .all();
  });

  // Posts capturados en un run específico, con el flag is_new y el nombre del grupo.
  ipcMain.handle('extraction:getRunPosts', (_e, runId: number) => {
    return getDb()
      .prepare(`
        SELECT
          p.id,
          p.post_url,
          p.author_name,
          p.author_url,
          p.text,
          p.images,
          p.status,
          p.collected_at,
          g.name AS group_name,
          erp.is_new,
          erp.seen_at
        FROM extraction_run_posts erp
        JOIN pets p ON p.id = erp.pet_id
        LEFT JOIN groups g ON g.id = p.group_id
        WHERE erp.run_id = ?
        ORDER BY erp.is_new DESC, erp.seen_at DESC
      `)
      .all(runId);
  });
}
