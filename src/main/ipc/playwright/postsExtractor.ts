import { Page } from 'playwright-core';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomDelay, safeGoto } from './helpers';

export interface ExtractedPost {
  postUrl: string;
  authorName: string;
  authorUrl: string;
  text: string;
  images: string[];
  publishedAt: string;
  groupUrl: string;
  isShare?: boolean;
}

const PET_KEYWORDS = [
  'perdido', 'perdida', 'extraviado', 'extraviada', 'extravió',
  'desaparecido', 'desaparecida', 'desapareció',
  'se perdió', 'se nos perdió', 'busco a mi', 'buscando a mi',
  'ayuda a encontrar', 'ayuda encontrar', 'lo perdimos', 'la perdimos',
  'recompensa', 'reward', 'lost', 'missing',
  'visto', 'vista', 'encontrado', 'encontrada',
  'mi perro', 'mi perra', 'mi gato', 'mi gata', 'mi mascota',
];

// Si hay texto: evalúa keywords.
// Si no hay texto pero hay imágenes: pasa igual (imagen de mascota sin texto en DOM).
function looksLikeLostPet(text: string, hasImages: boolean): boolean {
  if (!text || text.length < 15) return hasImages;
  const lower = text.toLowerCase();
  return PET_KEYWORDS.some((kw) => lower.includes(kw));
}

// Desplaza al fondo absoluto del documento para activar el IntersectionObserver
// (sentinel de infinite scroll de Facebook). window.scrollBy no lo dispara de forma fiable.
const SCROLL_TO_BOTTOM_FN = `
  (() => {
    window.scrollTo(0, document.body.scrollHeight);
    return document.body.scrollHeight;
  })()
`;

// Hook para enriquecer un share llegando al post original.
// V1: no-op — confiamos en la preview embebida (texto + imágenes + URL original) extraída inline.
// V2 (futuro): abrir page.context().newPage(), navegar a post.postUrl (que ya es la URL del
//   original), extraer el DOM del detalle del post, y devolver el `post` enriquecido. La firma
//   y el punto de llamada ya están en su sitio para que el cambio sea local a esta función.
async function resolveOriginalPost(_page: Page, post: ExtractedPost): Promise<ExtractedPost> {
  return post;
}

// Cambia el orden del feed del grupo a "Nuevas publicaciones" (orden cronológico real).
// Por defecto FB usa "Actividad reciente", que reordena por comentarios nuevos — eso rompe
// el scraping incremental porque un post viejo con un comentario fresco aparecería al tope
// del feed. "Nuevas publicaciones" garantiza orden por fecha de publicación.
//
// Flujo:
//   1. Detectar el botón "Ordenar feed del grupo por: <modo>" y leer el modo actual.
//   2. Si ya está en "Nuevas publicaciones", no hacemos nada.
//   3. Click en el botón (vía Playwright dispatchEvent — trusted) para abrir el menú.
//   4. Esperar a que aparezcan los [role="menuitemradio"].
//   5. Click en la opción "Nuevas publicaciones".
//   6. Esperar al re-render del feed y verificar que el botón ahora dice "Nuevas publicaciones".
async function switchToNewestPosts(page: Page): Promise<boolean> {
  try {
    const currentMode = await page.evaluate(() => {
      const btn = (Array.from(document.querySelectorAll('[role="button"]')) as HTMLElement[])
        .find((el) => /ordenar feed del grupo por/i.test(el.innerText || ''));
      if (!btn) return 'no-encontrado';
      const txt = (btn.innerText || '').toLowerCase();
      if (/nuevas publicaciones/.test(txt)) return 'nuevas';
      if (/actividad reciente/.test(txt)) return 'actividad';
      return 'desconocido';
    });

    if (currentMode === 'no-encontrado') {
      console.log('[postsExtractor] (sort) Botón de orden no presente — saltando');
      return false;
    }
    if (currentMode === 'nuevas') {
      console.log('[postsExtractor] (sort) Feed ya está en "Nuevas publicaciones"');
      return true;
    }
    console.log(`[postsExtractor] (sort) Modo actual: ${currentMode} → cambiando a "Nuevas publicaciones"`);

    // Abrir el menú
    const sortHandle = await page.evaluateHandle(() =>
      (Array.from(document.querySelectorAll('[role="button"]')) as HTMLElement[])
        .find((el) => /ordenar feed del grupo por/i.test(el.innerText || '')) || null
    );
    const sortEl = sortHandle.asElement();
    if (!sortEl) { await sortHandle.dispose(); return false; }
    await sortEl.dispatchEvent('click');
    await sortHandle.dispose();

    // Esperar a que aparezcan las opciones
    try {
      await page.waitForSelector('[role="menuitemradio"]', { timeout: 5000 });
    } catch {
      console.log('[postsExtractor] (sort) El menú no apareció tras click');
      return false;
    }
    await page.waitForTimeout(randomDelay(400, 800));

    // Click en "Nuevas publicaciones"
    const optHandle = await page.evaluateHandle(() =>
      (Array.from(document.querySelectorAll('[role="menuitemradio"]')) as HTMLElement[])
        .find((el) => /nuevas publicaciones/i.test(el.innerText || '')) || null
    );
    const optEl = optHandle.asElement();
    if (!optEl) {
      await optHandle.dispose();
      console.log('[postsExtractor] (sort) Opción "Nuevas publicaciones" no hallada en el menú');
      return false;
    }
    await optEl.dispatchEvent('click');
    await optHandle.dispose();

    // Esperar al re-render
    await page.waitForTimeout(randomDelay(2500, 4000));

    // Verificación: el texto del botón de sort ahora debe decir "Nuevas publicaciones"
    const verified = await page.evaluate(() => {
      const btn = (Array.from(document.querySelectorAll('[role="button"]')) as HTMLElement[])
        .find((el) => /ordenar feed del grupo por/i.test(el.innerText || ''));
      return btn ? /nuevas publicaciones/i.test(btn.innerText || '') : false;
    });
    console.log(`[postsExtractor] (sort) Cambio confirmado: ${verified ? 'OK' : 'NO'}`);
    return verified;
  } catch (e: any) {
    console.log(`[postsExtractor] (sort) Error: ${e?.message}`);
    return false;
  }
}

export async function extractPostsFromGroup(
  page: Page,
  groupUrl: string,
  options: {
    maxScrolls?: number;
    onlyLostPets?: boolean;
    // ─── Modo incremental ───────────────────────────────────────────────────
    // Si se pasa un Set de URLs ya conocidas (de la BD), el extractor cuenta
    // cuántas rondas seguidas no traen posts nuevos y corta cuando ese contador
    // alcanza `incrementalStopAfter`. Esto solo tiene sentido si el feed está
    // ordenado cronológicamente (switchToNewestPosts), porque depende de que
    // los posts viejos aparezcan AL FINAL del scroll.
    knownUrls?: Set<string>;
    incrementalStopAfter?: number;
  } = {}
): Promise<ExtractedPost[]> {
  const maxScrolls = options.maxScrolls ?? 15;
  const onlyLostPets = options.onlyLostPets ?? true;
  const knownUrls = options.knownUrls;
  const incrementalStopAfter = options.incrementalStopAfter ?? 3;
  const incrementalEnabled = !!knownUrls;

  console.log(`[postsExtractor] Navegando a ${groupUrl}`);
  const ok = await safeGoto(page, groupUrl, 60000);
  if (!ok) return [];

  // Espera generosa para dar tiempo al primer render del feed
  await page.waitForTimeout(randomDelay(7000, 10000));

  const isLoginPage = await page.evaluate(() =>
    document.querySelector('input[name="email"], form[action*="login"]') !== null
  );
  if (isLoginPage) throw new Error('Sesión expirada — volver a iniciar sesión en Cuentas');

  // Cambiar el orden del feed a "Nuevas publicaciones" (orden cronológico real).
  // Esto es importante para extracciones diarias: con "Actividad reciente" un post viejo
  // con un comentario nuevo aparecería al tope, lo cual confundiría tanto al filtro como
  // a un futuro modo incremental ("cortar cuando lleguemos a posts ya conocidos").
  await switchToNewestPosts(page);

  // ─── DIAGNÓSTICO FORENSE ─────────────────────────────────────────────────
  // Vuelca: screenshot + HTML completo + métricas DOM clave + URL final.
  // Carpeta: %APPDATA%\automatizacion-mascotas\debug\
  try {
    const debugDir = path.join(app.getPath('userData'), 'debug');
    fs.mkdirSync(debugDir, { recursive: true });
    const gidMatch = groupUrl.match(/\/groups\/([^/?]+)/);
    const slug = (gidMatch?.[1] || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `${slug}_${ts}`;

    const diag = await page.evaluate(() => {
      const q = (s: string) => document.querySelectorAll(s).length;
      const text = (s: string) => (document.querySelector(s)?.textContent || '').trim().slice(0, 200);
      const bodyText = (document.body?.innerText || '').slice(0, 3000);
      const buttons = Array.from(document.querySelectorAll('div[role="button"], a[role="button"], button')) as HTMLElement[];
      const joinBtn = buttons.find((b) => /unirse|únete|join group|join this group/i.test(b.innerText || ''));
      return {
        finalUrl: location.href,
        title: document.title,
        counts: {
          roleFeed: q('[role="feed"]'),
          roleArticle: q('[role="article"]'),
          groupFeedPagelet: q('[data-pagelet*="GroupFeed"], [data-pagelet*="Group"]'),
          feedUnit: q('[data-pagelet*="FeedUnit"], [data-pagelet*="FeedUnit_"]'),
          profileName: q('[data-ad-rendering-role="profile_name"]'),
          storyMessage: q('[data-ad-rendering-role="story_message"]'),
          adPreviewMsg: q('[data-ad-preview="message"], [data-ad-comet-preview="message"]'),
          divDirAuto: q('div[dir="auto"]'),
          fbcdnImgs: q('img[src*="fbcdn"], img[src*="scontent"]'),
          photoLinks: q('a[href*="/photo/?fbid="], a[href*="/photo/"]'),
          loginForm: q('input[name="email"], form[action*="login"]'),
        },
        joinButtonText: joinBtn ? (joinBtn.innerText || '').slice(0, 80) : null,
        checkpointHint: /checkpoint|security check|verifica tu identidad|confirma tu identidad/i.test(bodyText),
        notAvailableHint: /no disponible|content not available|isn't available|este contenido no está disponible/i.test(bodyText),
        h1: text('h1'),
        h2First: text('h2'),
        bodyPreview: bodyText.replace(/\s+/g, ' ').slice(0, 800),
      };
    });

    const screenshotPath = path.join(debugDir, `${baseName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const htmlPath = path.join(debugDir, `${baseName}.html`);
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf8');

    const diagPath = path.join(debugDir, `${baseName}.json`);
    fs.writeFileSync(diagPath, JSON.stringify(diag, null, 2), 'utf8');

    console.log(`\n[postsExtractor] ─── DIAGNÓSTICO ───`);
    console.log(`[postsExtractor] finalUrl    : ${diag.finalUrl}`);
    console.log(`[postsExtractor] title       : ${diag.title}`);
    console.log(`[postsExtractor] h1          : "${diag.h1}"`);
    console.log(`[postsExtractor] counts      : ${JSON.stringify(diag.counts)}`);
    console.log(`[postsExtractor] joinButton  : ${diag.joinButtonText ? `"${diag.joinButtonText}"` : 'no'}`);
    console.log(`[postsExtractor] checkpoint  : ${diag.checkpointHint}`);
    console.log(`[postsExtractor] notAvailable: ${diag.notAvailableHint}`);
    console.log(`[postsExtractor] bodyPreview : ${diag.bodyPreview.slice(0, 300)}...`);
    console.log(`[postsExtractor] → screenshot: ${screenshotPath}`);
    console.log(`[postsExtractor] → html:       ${htmlPath}`);
    console.log(`[postsExtractor] → diag:       ${diagPath}`);
    console.log(`[postsExtractor] ───────────────────\n`);
  } catch (e: any) {
    console.log(`[postsExtractor] (diagnóstico falló: ${e?.message})`);
  }

  const postsMap = new Map<string, ExtractedPost>();
  let captureRound = 0;

  // FB trunca textos largos a ~360ch y muestra un botón "Ver más" inline dentro del
  // story_message. Lo expandimos antes de cada captura para guardar el texto completo.
  //
  // Solo objetivo: botones cuyo textContent === "Ver más" (o traducciones) y que viven
  // dentro de un contenedor de mensaje — así NO clickamos "Ver más comentarios",
  // "Ver más respuestas", "Ver más fotos", etc.
  //
  // El click DEBE ir por Playwright (page.locator().dispatchEvent) y NO por element.click()
  // dentro de evaluate(). FB ignora clicks con isTrusted=false como anti-bot, así que
  // necesitamos un evento sintetizado por el navegador. Playwright lo logra inyectando
  // via CDP. Usamos dispatchEvent en lugar de click() para evitar el scroll-into-view
  // automático que interferiría con nuestro infinite scroll.
  const expandSeeMore = async (): Promise<number> => {
    // 1) Localizar todos los "Ver más" candidatos en el feed via evaluate, devolviendo
    //    índices para poder atacarlos via Playwright sin tener que generar selectores.
    const candidateCount = await page.evaluate(() => {
      const feedEl = document.querySelector('[role="feed"]');
      if (!feedEl) {
        (window as any).__seeMoreNodes = [];
        return 0;
      }
      const targets = new Set(['ver más', 'ver mas', 'see more', 'ver mais', 'voir plus']);
      const containers = feedEl.querySelectorAll(
        '[data-ad-rendering-role="story_message"], ' +
        '[data-ad-preview="message"], ' +
        '[data-ad-comet-preview="message"]'
      );
      const nodes: HTMLElement[] = [];
      for (const container of Array.from(containers)) {
        const buttons = container.querySelectorAll(
          '[role="button"], div[tabindex="0"], span[role="button"]'
        );
        for (const btn of Array.from(buttons) as HTMLElement[]) {
          const txt = (btn.textContent || '').trim().toLowerCase();
          if (!targets.has(txt)) continue;
          nodes.push(btn);
        }
      }
      // Guardamos referencia para que Playwright pueda re-localizarlos via JSHandle.
      (window as any).__seeMoreNodes = nodes;
      return nodes.length;
    });

    if (candidateCount === 0) return 0;

    // 2) Clickar cada nodo via Playwright. Usamos evaluateHandle para recuperar el
    //    ElementHandle, luego loc.click() (trusted event). force:true evita waitFor
    //    visibilidad/estabilidad estricta — el nodo ya lo seleccionamos arriba.
    let clicked = 0;
    for (let i = 0; i < candidateCount; i++) {
      try {
        const handle = await page.evaluateHandle((idx) => {
          const arr: HTMLElement[] = (window as any).__seeMoreNodes || [];
          return arr[idx] || null;
        }, i);
        const el = handle.asElement();
        if (!el) { await handle.dispose(); continue; }
        // dispatchEvent('click') usa la API de Playwright que envía un evento
        // sintetizado por el navegador (trusted en CDP). No scrollea.
        await el.dispatchEvent('click');
        clicked++;
        await handle.dispose();
      } catch (_) { /* ignore individual fallos */ }
    }

    // 3) Liberar la referencia global y esperar a que React rehidrate.
    await page.evaluate(() => { delete (window as any).__seeMoreNodes; });
    if (clicked > 0) {
      await page.waitForTimeout(randomDelay(800, 1400));
    }
    return clicked;
  };

  const capture = async () => {
    captureRound++;
    type EvalResult = { posts: ExtractedPost[]; logs: string[] };

    console.log(`\n[postsExtractor] ── capture() ronda ${captureRound} ──`);
    const expandedCount = await expandSeeMore();
    if (expandedCount > 0) {
      console.log(`[postsExtractor] expandidos ${expandedCount} "Ver más"`);
    }

    const { posts: captured, logs } = await page.evaluate((groupUrl): EvalResult => {
      const logs: string[] = [];
      const out: ExtractedPost[] = [];

      // ─── DETECTAR WRAPPERS DE POSTS ─────────────────────────────────────────
      // Layout moderno de FB en grupos: los posts NO están en [role="article"]
      // (eso lo usa el composer y widgets). Cada post es un hijo directo de
      // [role="feed"], y se identifica por contener un profile_name.
      // Fallback: layouts viejos donde sí se usa [role="article"] top-level.
      const feedEl = document.querySelector('[role="feed"]');
      const wrappers: HTMLElement[] = [];
      let detectionStrategy = '';
      if (feedEl) {
        for (const child of Array.from(feedEl.children) as HTMLElement[]) {
          if (child.querySelector('[data-ad-rendering-role="profile_name"]')) {
            wrappers.push(child);
          }
        }
        detectionStrategy = `feed-children (${wrappers.length}/${feedEl.children.length})`;
      }
      if (wrappers.length === 0) {
        for (const a of Array.from(document.querySelectorAll('[role="article"]')) as HTMLElement[]) {
          if (a.parentElement?.closest('[role="article"]')) continue;
          if (!a.querySelector('[data-ad-rendering-role="profile_name"]')) continue;
          wrappers.push(a);
        }
        detectionStrategy = `fallback role=article (${wrappers.length})`;
      }
      logs.push(`wrappers detectados: ${wrappers.length} [${detectionStrategy}]`);

      for (let idx = 0; idx < wrappers.length; idx++) {
        const articleEl = wrappers[idx];
        try {

          // ─── 0.5. DETECCIÓN DE SHARE (estructural) ──────────────────────────
          // FB no siempre renderiza "compartió la publicación". Detección por estructura:
          //   >1 profile_name (sharer + autor original)  ó
          //   >1 story_message (comentario del sharer + texto original)
          const profileNames = articleEl.querySelectorAll(
            '[data-ad-rendering-role="profile_name"]'
          ) as NodeListOf<HTMLElement>;
          const storyMessages = articleEl.querySelectorAll(
            '[data-ad-rendering-role="story_message"]'
          ) as NodeListOf<HTMLElement>;
          const isShare = profileNames.length > 1 || storyMessages.length > 1;

          // Para shares: localizar el contenedor del post embebido (la "card" del original).
          // Walk-up desde el SEGUNDO profile_name hasta encontrar un ancestro que ya contenga
          // el contenido original (story_message o link /photo/?fbid=). Si el cursor crece
          // hasta englobar también al sharer (primer profile_name), abortamos: significa que
          // ya salimos de la card embebida y volveríamos a mezclar fuentes.
          let sourceEl: HTMLElement = articleEl;
          if (isShare && profileNames.length > 1) {
            const sharerProfile = profileNames[0];
            const originalProfile = profileNames[1];
            let cursor: HTMLElement | null = originalProfile.parentElement;
            while (cursor && cursor !== articleEl) {
              if (cursor.contains(sharerProfile)) break;
              const hasInnerStory = cursor.querySelector('[data-ad-rendering-role="story_message"]');
              const hasInnerFbid = cursor.querySelector('a[href*="/photo/?fbid="]');
              if (hasInnerStory || hasInnerFbid) {
                sourceEl = cursor;
                break;
              }
              cursor = cursor.parentElement;
            }
          }

          if (isShare) {
            logs.push(`  art[${idx}] → SHARE (profile_names=${profileNames.length}, story_msgs=${storyMessages.length}, source=${sourceEl === articleEl ? 'wrapper' : 'embebido'})`);
          }

          // ─── 1. TEXTO ────────────────────────────────────────────────────────
          // Para shares con sourceEl=embedded: solo se extrae el story_message del original.
          // Para shares con sourceEl=wrapper (fallback): se mezclan sharer + original, lo
          //   cual no es ideal pero sirve para keyword matching.
          // Su AUSENCIA combinada con presencia de imágenes = post solo-imagen (válido).
          //
          // ⚠ Deduplicación: FB a veces renderiza el mismo texto en dos contenedores
          //   (story_message + ad_preview_message) — sibling o anidado. Filtramos:
          //   (a) descartar bloques anidados dentro de otro bloque ya capturado,
          //   (b) descartar bloques con texto idéntico al de otro ya capturado.
          //
          // ⚠ Limpieza de "Ver más"/"Ver menos": tras expandir un post, FB cambia
          //   el botón a "Ver menos" — su textContent queda como sufijo. Lo strippeamos.
          const stripTrailingButton = (s: string): string =>
            s.replace(/\s*(?:\.{3}\s*)?(ver más|ver mas|ver menos|see more|see less|ver mais|ver menos|voir plus|voir moins)\s*$/i, '').trim();

          let text = '';
          const allTextBlocks = Array.from(sourceEl.querySelectorAll(
            '[data-ad-rendering-role="story_message"], [data-ad-preview="message"], [data-ad-comet-preview="message"]'
          )) as HTMLElement[];

          const textsKept: string[] = [];
          const seenTexts = new Set<string>();
          for (const block of allTextBlocks) {
            // (a) Anidado dentro de otro bloque que ya capturamos? skip.
            if (allTextBlocks.some((other) => other !== block && other.contains(block))) continue;
            const cleaned = stripTrailingButton((block.textContent || '').trim());
            if (!cleaned) continue;
            // (b) Texto idéntico al de otro bloque ya guardado? skip.
            if (seenTexts.has(cleaned)) continue;
            seenTexts.add(cleaned);
            textsKept.push(cleaned);
          }
          text = textsKept.join('\n');

          if (!text) {
            const parts: string[] = [];
            for (const d of Array.from(sourceEl.querySelectorAll('div[dir="auto"]'))) {
              const t = stripTrailingButton((d.textContent || '').trim());
              if (t.length > 10 && !parts.includes(t)) parts.push(t);
            }
            text = parts.join('\n').trim();
          }
          const hasStoryMessage = allTextBlocks.length > 0;

          // ─── 2. IMÁGENES ─────────────────────────────────────────────────────
          // Todos los pases sobre sourceEl: para shares con embedded esto restringe a las
          // imágenes del post original, evitando contaminar con avatares/banners del wrapper.
          const images: string[] = [];
          // (a) Imágenes reales del post: a[href*="/photo/?fbid="] img.
          for (const a of Array.from(
            sourceEl.querySelectorAll('a[href*="/photo/?fbid="]')
          ) as HTMLAnchorElement[]) {
            const img = a.querySelector('img') as HTMLImageElement | null;
            if (img && img.src && !images.includes(img.src)) images.push(img.src);
          }
          // (b) Pase amplio: cualquier a[href*="/photo/"] que aún no haya sido capturado.
          for (const a of Array.from(
            sourceEl.querySelectorAll('a[href*="/photo/"]')
          ) as HTMLAnchorElement[]) {
            const img = a.querySelector('img') as HTMLImageElement | null;
            if (img && img.src && !images.includes(img.src)) images.push(img.src);
          }
          // (c) Fallback: <img> de CDN de FB sin anchor /photo/ (layouts antiguos).
          for (const img of Array.from(
            sourceEl.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"]')
          ) as HTMLImageElement[]) {
            const attrW = parseInt(img.getAttribute('width') || '0', 10);
            const attrH = parseInt(img.getAttribute('height') || '0', 10);
            if ((attrW > 0 && attrW < 60) || (attrH > 0 && attrH < 60)) continue;
            if (!images.includes(img.src)) images.push(img.src);
          }
          const isImageOnly = !hasStoryMessage && images.length > 0;

          logs.push(`  art[${idx}] text=${text.length}ch imgs=${images.length} preview="${text.slice(0, 60).replace(/\n/g, ' ')}"`);

          // ─── 3. FILTRO INICIAL ───────────────────────────────────────────────
          if (text.length < 15 && images.length === 0) {
            logs.push(`  art[${idx}] → SKIP (sin texto ni imágenes)`);
            continue;
          }

          // ─── 4. AUTOR ────────────────────────────────────────────────────────
          // Para shares: queremos el autor ORIGINAL, no el sharer.
          //   - Si sourceEl=embedded: su primer profile_name ES el original.
          //   - Si sourceEl=wrapper: tomamos explícitamente profileNames[1].
          let authorName = '';
          let authorUrl = '';
          // aria-label es más fiable que textContent en FB (texto en spans ofuscados).
          const resolveAnchorName = (a: HTMLAnchorElement): string =>
            (a.getAttribute('aria-label') || a.textContent || '').trim();

          let profileEl: HTMLAnchorElement | null = null;
          if (isShare && sourceEl === articleEl && profileNames.length > 1) {
            profileEl = profileNames[1].querySelector('a') as HTMLAnchorElement | null;
          } else {
            profileEl = sourceEl.querySelector(
              '[data-ad-rendering-role="profile_name"] a'
            ) as HTMLAnchorElement | null;
          }
          if (profileEl) {
            authorName = resolveAnchorName(profileEl);
            authorUrl = profileEl.href.split('?')[0];
          }
          if (!authorName) {
            const fallback = sourceEl.querySelector(
              'a[href*="/user/"][aria-label], a[href*="/user/"][role="link"], h2 a, h3 a, strong a'
            ) as HTMLAnchorElement | null;
            if (fallback) {
              authorName = resolveAnchorName(fallback);
              authorUrl = fallback.href.split('?')[0];
            }
          }
          if (!authorName) {
            const h = sourceEl.querySelector('h2, h3, h4');
            if (h) authorName = (h.textContent || '').trim().split('\n')[0];
          }
          logs.push(`  art[${idx}] autor="${authorName}" authorUrl="${authorUrl.slice(0, 60)}"`);

          // ─── 5. URL DEL POST ─────────────────────────────────────────────────
          let postUrl = '';
          let urlStrategy = '';

          // SHARE: URL canónica = la del POST ORIGINAL.
          // Esto deduplica cuando varias personas comparten el mismo caso.
          // Orden de búsqueda dentro de sourceEl (la card embebida si la hallamos):
          //   1) /posts/ de un grupo DIFERENTE al actual
          //   2) /permalink/ o story_fbid= (post de perfil personal)
          //   3) /photo/?fbid= (cuando el original es solo-imagen y no tiene URL de post)
          if (isShare) {
            const gidMatch = groupUrl.match(/\/groups\/(\d+)/);
            const currentGid = gidMatch?.[1] || '';
            for (const a of Array.from(sourceEl.querySelectorAll(
              'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="]'
            )) as HTMLAnchorElement[]) {
              if (!a.href || !a.href.includes('facebook.com')) continue;
              const gm = a.href.match(/\/groups\/(\d+)\/posts\/(\d+)/);
              if (gm && gm[1] !== currentGid) {
                postUrl = a.href.split('?')[0].split('#')[0];
                urlStrategy = 'SHARE-grupo-original';
                break;
              }
              if (!gm && (a.href.includes('/permalink/') || a.href.includes('story_fbid='))) {
                postUrl = a.href.split('?')[0].split('#')[0];
                urlStrategy = 'SHARE-perfil-original';
                break;
              }
            }
            if (!postUrl) {
              for (const a of Array.from(sourceEl.querySelectorAll(
                'a[href*="/photo/?fbid="]'
              )) as HTMLAnchorElement[]) {
                const fbidMatch = a.href.match(/fbid=(\d+)/);
                if (fbidMatch) {
                  postUrl = `https://www.facebook.com/photo/?fbid=${fbidMatch[1]}`;
                  urlStrategy = 'SHARE-photo-fbid';
                  break;
                }
              }
            }
          }

          if (!postUrl) {
            for (const a of Array.from(articleEl.querySelectorAll(
              'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], a[href*="/story.php"], a[href*="?multi_permalinks="]'
            )) as HTMLAnchorElement[]) {
              if (a.href && a.href.includes('facebook.com')) {
                postUrl = a.href.split('?')[0].split('#')[0];
                urlStrategy = 'E1-clasico';
                break;
              }
            }
          }

          if (!postUrl) {
            for (const a of Array.from(
              articleEl.querySelectorAll('a[href*="facebook.com"]')
            ) as HTMLAnchorElement[]) {
              if (/\/\d{12,}(\/|$)/.test(a.href)) {
                postUrl = a.href.split('?')[0].split('#')[0];
                urlStrategy = 'E2-numerico';
                break;
              }
            }
          }

          if (!postUrl) {
            const groupIdMatch = groupUrl.match(/\/groups\/(\d+)/);
            const authorIdMatch = authorUrl.match(/\/user\/(\d+)/);
            const gid = groupIdMatch?.[1] || '';
            const uid = authorIdMatch?.[1] || '';
            const imgKey = images.length > 0
              ? (images[0].split('/').pop()?.split('?')[0] || '').slice(0, 30)
              : '';
            const sample = text.slice(0, 120) + imgKey;
            let h = 0;
            for (let i = 0; i < sample.length; i++) {
              h = (Math.imul(31, h) + sample.charCodeAt(i)) | 0;
            }
            const hash = Math.abs(h).toString(36);
            if (gid) {
              postUrl = uid
                ? `https://www.facebook.com/groups/${gid}/posts/#${uid}-${hash}`
                : `https://www.facebook.com/groups/${gid}/posts/#${hash}`;
              urlStrategy = 'E3-sintetico';
            }
          }

          if (!postUrl) {
            logs.push(`  art[${idx}] → SKIP (sin postUrl, ni siquiera grupoId)`);
            continue;
          }
          logs.push(`  art[${idx}] postUrl="${postUrl.slice(0, 80)}" [${urlStrategy}]`);

          // ─── 6. FECHA ────────────────────────────────────────────────────────
          // FB ofusca el texto visible del timestamp (spans reordenados por CSS).
          // No intentamos parsearlo: dejamos vacío y eventualmente se derivará del postId
          // (los IDs numéricos de FB son monotónicos en el tiempo).
          const publishedAt = '';

          const tags = [
            isShare ? 'SHARE' : null,
            isImageOnly ? 'SOLO-IMAGEN' : null,
          ].filter(Boolean).join(' ');
          logs.push(`  art[${idx}] → OK${tags ? ' [' + tags + ']' : ''}`);
          out.push({ postUrl, authorName, authorUrl, text, images, publishedAt, groupUrl, isShare });
        } catch (e: any) {
          logs.push(`  art[${idx}] → ERROR: ${e?.message}`);
        }
      }

      return { posts: out, logs };
    }, groupUrl);

    // Imprimir logs del evaluate (el header de la ronda ya se imprimió arriba).
    for (const line of logs) console.log(`[postsExtractor] ${line}`);

    // Contar cuántos posts de ESTA ronda no estaban ya en la BD (knownUrls).
    // Si el modo incremental está activo, lo usamos para decidir si cortar pronto.
    let newToDb = 0;
    if (incrementalEnabled) {
      for (const p of captured) {
        if (!knownUrls!.has(p.postUrl)) newToDb++;
      }
    }
    const incTag = incrementalEnabled ? ` | nuevos-vs-BD: ${newToDb}/${captured.length}` : '';
    console.log(`[postsExtractor] → ${captured.length} post(s) en esta pasada | acumulado: ${postsMap.size}${incTag}`);

    for (const post of captured) {
      if (postsMap.has(post.postUrl)) continue;
      const enriched = await resolveOriginalPost(page, post);
      postsMap.set(enriched.postUrl, enriched);
    }
    return { newToDb };
  };

  await capture();

  let prevSize = postsMap.size;
  let stableRounds = 0;
  // Modo incremental: rondas consecutivas con 0 posts nuevos respecto a BD.
  let consecutiveKnownRounds = 0;

  // Tamaño del viewport para centrar el mouse (necesario para que mouse.wheel funcione)
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };

  for (let i = 0; i < maxScrolls; i++) {
    // 1. Scroll al fondo absoluto → activa el IntersectionObserver del sentinel de Facebook
    await page.evaluate(SCROLL_TO_BOTTOM_FN);
    // 2. mouse.wheel simula interacción real del usuario, refuerza el scroll event
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.wheel(0, 1500);
    // 3. Esperar a que Facebook cargue el lote nuevo de posts
    //    (delay generoso: FB tarda en hidratar los articles tras el scroll)
    await page.waitForTimeout(randomDelay(9000, 12000));
    const { newToDb } = await capture();

    // ─── Corte temprano por modo incremental ──────────────────────────────────
    // Si traemos 0 nuevos respecto a BD K rondas seguidas, asumimos que ya hemos
    // pasado la frontera con lo escaneado previamente y cortamos.
    if (incrementalEnabled) {
      if (newToDb === 0) {
        consecutiveKnownRounds++;
        if (consecutiveKnownRounds >= incrementalStopAfter) {
          console.log(`[postsExtractor] ✂ Corte incremental: ${incrementalStopAfter} ronda(s) sin posts nuevos vs BD`);
          break;
        }
      } else {
        consecutiveKnownRounds = 0;
      }
    }

    if (postsMap.size === prevSize) {
      stableRounds++;
      if (stableRounds >= 3) break;
    } else {
      stableRounds = 0;
      prevSize = postsMap.size;
    }

    if ((i + 1) % 3 === 0) {
      console.log(`[postsExtractor] Scroll ${i + 1}: ${postsMap.size} posts capturados`);
    }
  }

  const all = Array.from(postsMap.values());
  const filtered = onlyLostPets
    ? all.filter((p) => looksLikeLostPet(p.text, p.images.length > 0))
    : all;

  console.log(`[postsExtractor] Total: ${all.length} posts, ${filtered.length} relevantes`);
  return filtered;
}
