import { Page } from 'playwright-core';
import { randomDelay } from './helpers';

const SKIP_URL_PATTERNS = [
  '/joins', '/discover', '/explore', '/create', '/feed',
  '/search', '/members', '/events', '/media', '/files',
  '/about', 'grouptype', 'ref=', '/notifications', '/marketplace',
  '/settings', '/pending', '/reported', '/spam',
];

function isInvalidName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 150) return true;
  const lower = name.toLowerCase().trim();

  const UI_TEXTS = [
    'crear nuevo grupo', 'create new group', 'crear grupo', 'create group',
    'ver más', 'see more', 'ver grupo', 'view group', 'see group',
    'unirse al grupo', 'join group', 'unirse', 'join',
    'grupo sugerido', 'suggested group', 'grupos', 'groups',
    'invitar', 'invite', 'compartir', 'share', 'grupo',
    'cancelar', 'cancel', 'salir del grupo', 'leave group',
  ];
  if (UI_TEXTS.includes(lower)) return true;

  if (lower.startsWith('tu última visita')) return true;
  if (lower.startsWith('your last visit')) return true;
  if (lower.startsWith('activo por última vez')) return true;
  if (lower.startsWith('active ')) return true;
  if (lower.startsWith('solicitó unirse')) return true;
  if (lower.startsWith('requested to join')) return true;
  if (lower.startsWith('grupos a los que')) return true;
  if (lower.startsWith('groups you')) return true;
  if (lower.startsWith('administrar config')) return true;
  if (lower.startsWith('manage notification')) return true;

  if (/^hace\s/i.test(lower)) return true;
  if (/^\d+[\s,.]?\d*\s*(miembros|members|publicaci|posts|admins?)/i.test(lower)) return true;
  if (/^grupo\s+(público|privado|public|private)/i.test(lower)) return true;

  return false;
}

function isValidGroupUrl(url: string): boolean {
  if (!url.includes('/groups/')) return false;
  return !SKIP_URL_PATTERNS.some(s => url.includes(s));
}

function cleanGroupUrl(rawUrl: string): string {
  return rawUrl.split('?')[0].replace(/\/$/, '');
}

function extractGroupsFromJson(obj: any, map: Map<string, string>): void {
  if (!obj || typeof obj !== 'object') return;

  if (obj.__typename === 'Group' && obj.url && obj.name) {
    const clean = cleanGroupUrl(obj.url);
    if (isValidGroupUrl(clean) && !isInvalidName(obj.name)) {
      map.set(clean, obj.name);
    }
  }

  if (Array.isArray(obj)) {
    for (const item of obj) extractGroupsFromJson(item, map);
  } else {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        extractGroupsFromJson(obj[key], map);
      }
    }
  }
}

const SCROLL_DOWN_FN = `
  (() => {
    const main = document.querySelector('[role="main"]');
    if (main && main.scrollHeight > main.clientHeight) {
      main.scrollTop += 600;
      return { target: 'role=main', scrollTop: main.scrollTop, scrollHeight: main.scrollHeight };
    }

    const candidates = Array.from(document.querySelectorAll('div'))
      .filter(el => {
        const style = getComputedStyle(el);
        return (style.overflowY === 'scroll' || style.overflowY === 'auto')
          && el.scrollHeight > el.clientHeight + 100
          && el.clientHeight > 200;
      })
      .sort((a, b) => b.scrollHeight - a.scrollHeight);

    if (candidates.length > 0) {
      candidates[0].scrollTop += 600;
      return { target: 'overflow-div', scrollTop: candidates[0].scrollTop, scrollHeight: candidates[0].scrollHeight };
    }

    const doc = document.scrollingElement || document.documentElement;
    doc.scrollTop += 600;
    return { target: 'document', scrollTop: doc.scrollTop, scrollHeight: doc.scrollHeight };
  })()
`;

const SCROLL_TO_TOP_FN = `
  (() => {
    const main = document.querySelector('[role="main"]');
    if (main && main.scrollHeight > main.clientHeight) {
      main.scrollTop = 0;
      return;
    }
    const candidates = Array.from(document.querySelectorAll('div'))
      .filter(el => {
        const style = getComputedStyle(el);
        return (style.overflowY === 'scroll' || style.overflowY === 'auto')
          && el.scrollHeight > el.clientHeight + 100
          && el.clientHeight > 200;
      })
      .sort((a, b) => b.scrollHeight - a.scrollHeight);
    if (candidates.length > 0) {
      candidates[0].scrollTop = 0;
      return;
    }
    const doc = document.scrollingElement || document.documentElement;
    doc.scrollTop = 0;
  })()
`;

async function captureGroupUrlsFromDom(page: Page, groupsMap: Map<string, string>): Promise<void> {
  const urls = await page.evaluate((): string[] => {
    const SKIP = [
      '/joins', '/discover', '/explore', '/create', '/feed',
      '/search', '/members', '/events', '/media', '/files',
      '/about', 'grouptype', 'ref=', '/notifications', '/marketplace',
      '/settings', '/pending', '/reported', '/spam',
    ];

    const results: string[] = [];
    const seen = new Set<string>();

    for (const a of Array.from(document.querySelectorAll('a[href*="/groups/"]')) as HTMLAnchorElement[]) {
      const href = a.href;
      if (!href.includes('facebook.com/groups/')) continue;

      const inSidebar = a.closest(
        '[role="complementary"], [aria-label="Messenger"], [aria-label="Chat"], ' +
        '[data-pagelet="RightRail"], [data-pagelet="ChatTab"]'
      );
      if (inSidebar) continue;

      const clean = href.split('?')[0].replace(/\/$/, '');
      if (SKIP.some(s => clean.includes(s))) continue;

      const groupPart = clean.split('/groups/')[1];
      if (!groupPart || groupPart.length < 1) continue;

      if (seen.has(clean)) continue;
      seen.add(clean);
      results.push(clean);
    }

    return results;
  });

  for (const url of urls) {
    if (!groupsMap.has(url)) {
      groupsMap.set(url, '');
    }
  }
}

async function resolveGroupNames(page: Page, groupsMap: Map<string, string>): Promise<void> {
  const urlsWithoutName: string[] = [];
  for (const [url, name] of groupsMap) {
    if (!name || isInvalidName(name)) urlsWithoutName.push(url);
  }

  if (urlsWithoutName.length === 0) return;
  if (urlsWithoutName.length <= 2) return;
  console.log(`[extractGroups] Resolviendo nombres de ${urlsWithoutName.length} grupos vía fetch...`);

  const BATCH_SIZE = 6;
  for (let i = 0; i < urlsWithoutName.length; i += BATCH_SIZE) {
    const batch = urlsWithoutName.slice(i, i + BATCH_SIZE);

    const results = await page.evaluate(async (urls: string[]): Promise<Array<{ url: string; name: string }>> => {
      const out: Array<{ url: string; name: string }> = [];
      for (const url of urls) {
        try {
          const resp = await fetch(url, {
            credentials: 'include',
            headers: { 'Accept': 'text/html' },
          });
          const html = await resp.text();

          let name = '';
          const ogMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
                       || html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
          if (ogMatch) {
            name = ogMatch[1]
              .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#x27;/g, "'")
              .replace(/\s*[|·–—].*Facebook.*$/i, '').trim();
          }
          if (!name) {
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) {
              name = titleMatch[1]
                .replace(/&amp;/g, '&')
                .replace(/\s*[|·–—].*Facebook.*$/i, '')
                .replace(/\s*-\s*Facebook.*$/i, '').trim();
            }
          }
          if (name && name.toLowerCase() !== 'facebook') {
            out.push({ url, name });
          }
        } catch { /* ignorar */ }
      }
      return out;
    }, batch);

    for (const r of results) {
      if (!isInvalidName(r.name)) groupsMap.set(r.url, r.name);
    }

    if (i + BATCH_SIZE < urlsWithoutName.length) {
      await page.waitForTimeout(randomDelay(200, 400));
    }
  }
}

export async function extractGroupsComplete(
  page: Page,
  targetUrl: string,
  boundSafeGoto: (url: string) => Promise<boolean>
): Promise<Array<{ name: string; url: string }>> {
  const groupsMap = new Map<string, string>();

  const graphqlHandler = async (response: any) => {
    try {
      const reqUrl = response.url();
      if (!reqUrl.includes('graphql')) return;

      const text = await response.text().catch(() => '');
      if (!text || text.length < 100) return;

      const cleanText = text.replace(/^for\s*\(;;\)\s*;\s*/, '');
      const lines = cleanText.split('\n').filter((l: string) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          extractGroupsFromJson(json, groupsMap);
        } catch { /* no es JSON válido */ }
      }
    } catch { /* ignorar */ }
  };

  page.on('response', graphqlHandler);

  const navOk = await boundSafeGoto(targetUrl);
  if (!navOk) {
    page.off('response', graphqlHandler);
    return [];
  }
  await page.waitForTimeout(randomDelay(2500, 4000));

  await captureGroupUrlsFromDom(page, groupsMap);

  let previousCount = 0;
  let stableRounds = 0;
  const MAX_STABLE = 3;
  const MAX_SCROLLS = 50;
  let scrollCount = 0;

  while (stableRounds < MAX_STABLE && scrollCount < MAX_SCROLLS) {
    await page.evaluate(SCROLL_DOWN_FN);
    await page.waitForTimeout(randomDelay(400, 800));
    scrollCount++;

    if (scrollCount === 1 || scrollCount % 2 === 0) {
      await captureGroupUrlsFromDom(page, groupsMap);
    }

    const currentCount = groupsMap.size;
    if (currentCount === previousCount) stableRounds++;
    else { stableRounds = 0; previousCount = currentCount; }
  }

  await page.evaluate(SCROLL_TO_TOP_FN);
  await page.waitForTimeout(randomDelay(1500, 2500));
  await captureGroupUrlsFromDom(page, groupsMap);

  page.off('response', graphqlHandler);

  await resolveGroupNames(page, groupsMap);

  const results: Array<{ name: string; url: string }> = [];
  const seenUrls = new Set<string>();
  const seenExactNames = new Set<string>();

  for (const [url, name] of groupsMap) {
    if (!name || isInvalidName(name)) continue;
    if (seenUrls.has(url)) continue;
    if (seenExactNames.has(name)) continue;
    seenUrls.add(url);
    seenExactNames.add(name);
    results.push({ name, url });
  }

  console.log(`[extractGroups] FINAL: ${results.length} grupos válidos en ${scrollCount} scrolls`);
  return results;
}
