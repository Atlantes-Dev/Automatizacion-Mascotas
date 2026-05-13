import { Page } from 'playwright-core';
import { randomDelay, safeGoto } from './helpers';

export interface ExtractedPost {
  postUrl: string;
  authorName: string;
  authorUrl: string;
  text: string;
  images: string[];
  publishedAt: string;
  groupUrl: string;
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

function looksLikeLostPet(text: string): boolean {
  if (!text || text.length < 15) return false;
  const lower = text.toLowerCase();
  return PET_KEYWORDS.some((kw) => lower.includes(kw));
}

const SCROLL_DOWN_FN = `
  (() => {
    const main = document.querySelector('[role="main"]');
    if (main && main.scrollHeight > main.clientHeight) {
      main.scrollTop += 800;
      return true;
    }
    const doc = document.scrollingElement || document.documentElement;
    doc.scrollTop += 800;
    return true;
  })()
`;

/**
 * Extrae posts visibles del grupo. Hace scroll N veces y captura cada post
 * con su autor, texto, imágenes y URL. Filtra por palabras clave de mascotas.
 */
export async function extractPostsFromGroup(
  page: Page,
  groupUrl: string,
  options: { maxScrolls?: number; onlyLostPets?: boolean } = {}
): Promise<ExtractedPost[]> {
  const maxScrolls = options.maxScrolls ?? 15;
  const onlyLostPets = options.onlyLostPets ?? true;

  console.log(`[postsExtractor] Navegando a ${groupUrl}`);
  const ok = await safeGoto(page, groupUrl, 60000);
  if (!ok) return [];

  await page.waitForTimeout(randomDelay(3000, 5000));

  const postsMap = new Map<string, ExtractedPost>();

  const capture = async () => {
    const captured = await page.evaluate((groupUrl): ExtractedPost[] => {
      const out: ExtractedPost[] = [];

      const articles = document.querySelectorAll('[role="article"]');
      for (const art of Array.from(articles)) {
        try {
          const articleEl = art as HTMLElement;

          let postUrl = '';
          const links = articleEl.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="/groups/"][href*="/permalink"], a[href*="?multi_permalinks="]');
          for (const a of Array.from(links) as HTMLAnchorElement[]) {
            const href = a.href || '';
            if (href.includes('/posts/') || href.includes('/permalink/') || href.includes('multi_permalinks')) {
              postUrl = href.split('?')[0].split('#')[0];
              break;
            }
          }
          if (!postUrl) {
            const timeLinks = articleEl.querySelectorAll('a[role="link"][aria-label]');
            for (const a of Array.from(timeLinks) as HTMLAnchorElement[]) {
              if (a.href.includes('facebook.com') && (a.href.includes('/posts') || a.href.includes('/permalink'))) {
                postUrl = a.href.split('?')[0];
                break;
              }
            }
          }
          if (!postUrl) continue;

          let authorName = '';
          let authorUrl = '';
          const authorLink = articleEl.querySelector('h2 a, h3 a, strong a, [role="link"] strong') as HTMLAnchorElement | null;
          if (authorLink) {
            authorName = (authorLink.textContent || '').trim();
            const parentLink = authorLink.closest('a') as HTMLAnchorElement | null;
            if (parentLink) authorUrl = parentLink.href.split('?')[0];
          }
          if (!authorName) {
            const h2 = articleEl.querySelector('h2, h3, h4');
            if (h2) authorName = (h2.textContent || '').trim().split('\n')[0];
          }

          let text = '';
          const textBlocks = articleEl.querySelectorAll('[data-ad-preview="message"], [data-ad-comet-preview="message"]');
          if (textBlocks.length > 0) {
            text = Array.from(textBlocks).map((b) => (b.textContent || '').trim()).join('\n');
          } else {
            const dirAuto = articleEl.querySelectorAll('div[dir="auto"]');
            const parts: string[] = [];
            for (const d of Array.from(dirAuto)) {
              const t = (d.textContent || '').trim();
              if (t.length > 20 && !parts.includes(t)) parts.push(t);
            }
            text = parts.join('\n').trim();
          }

          const images: string[] = [];
          const imgs = articleEl.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"]');
          for (const img of Array.from(imgs) as HTMLImageElement[]) {
            const rect = img.getBoundingClientRect();
            if (rect.width < 100 || rect.height < 100) continue;
            if (!images.includes(img.src)) images.push(img.src);
          }

          let publishedAt = '';
          const timeEl = articleEl.querySelector('abbr, [aria-label*="hace"], [aria-label*="ago"]');
          if (timeEl) publishedAt = (timeEl.getAttribute('aria-label') || timeEl.textContent || '').trim();

          out.push({
            postUrl,
            authorName,
            authorUrl,
            text,
            images,
            publishedAt,
            groupUrl,
          });
        } catch { /* skip */ }
      }

      return out;
    }, groupUrl);

    for (const post of captured) {
      if (!postsMap.has(post.postUrl)) {
        postsMap.set(post.postUrl, post);
      }
    }
  };

  await capture();

  let prevSize = postsMap.size;
  let stableRounds = 0;

  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(SCROLL_DOWN_FN);
    await page.waitForTimeout(randomDelay(1500, 2800));
    await capture();

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
  const filtered = onlyLostPets ? all.filter((p) => looksLikeLostPet(p.text)) : all;

  console.log(`[postsExtractor] Total: ${all.length} posts, ${filtered.length} relevantes`);
  return filtered;
}
