import { Page } from 'playwright-core';
import * as childProcess from 'child_process';
import { getBrowserExecutablePath } from './chromium';

export function randomDelay(min = 1500, max = 3500): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

export async function waitForStable(page: Page): Promise<void> {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
  } catch { /* puede fallar si no hay navegación pendiente */ }
  await page.waitForTimeout(randomDelay(1000, 2000));
}

export async function safeGoto(page: Page, url: string, timeout = 30000): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await waitForStable(page);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
      return true;
    } catch (err: any) {
      const msg = err.message || '';
      console.warn(`[safeGoto] Intento ${attempt}/3 falló para ${url}: ${msg.substring(0, 80)}`);
      if (msg.includes('Target page, context or browser has been closed')) return false;
      if (attempt < 3) await page.waitForTimeout(randomDelay(2000, 4000));
    }
  }
  return false;
}

const WIDTHS  = [1280, 1366, 1440, 1536, 1920];
const HEIGHTS = [768, 800, 864, 900, 1080];

export function randomViewport(): { width: number; height: number } {
  return {
    width:  WIDTHS[Math.floor(Math.random() * WIDTHS.length)],
    height: HEIGHTS[Math.floor(Math.random() * HEIGHTS.length)],
  };
}

const FALLBACK_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
];

let _detectedMajorVersion: number | null | undefined = undefined;

function detectBrowserMajorVersion(): number | null {
  if (_detectedMajorVersion !== undefined) return _detectedMajorVersion;

  try {
    const execPath = getBrowserExecutablePath();
    if (!execPath) {
      _detectedMajorVersion = null;
      return null;
    }

    const psCmd = `(Get-Item '${execPath.replace(/'/g, "''")}').VersionInfo.ProductVersion`;
    const raw = childProcess.execSync(`powershell -NoProfile -Command "${psCmd}"`, {
      timeout: 5000,
      encoding: 'utf8',
      windowsHide: true,
    });

    const match = raw.trim().match(/^(\d+)\./);
    if (match) {
      _detectedMajorVersion = parseInt(match[1], 10);
      console.log(`[helpers] Versión del navegador detectada: ${raw.trim()} (major: ${_detectedMajorVersion})`);
      return _detectedMajorVersion;
    }
  } catch { /* usar fallback */ }

  _detectedMajorVersion = null;
  return null;
}

export function randomUserAgent(): string {
  const major = detectBrowserMajorVersion();
  if (major && major >= 100) {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  }
  return FALLBACK_USER_AGENTS[Math.floor(Math.random() * FALLBACK_USER_AGENTS.length)];
}

export function extractChromeMajor(ua: string): string {
  const m = ua.match(/Chrome\/(\d+)/);
  return m ? m[1] : '140';
}

export function getStealthScript(ua?: string): string {
  const chromeMajor = ua ? extractChromeMajor(ua) : '140';
  return `
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en-US', 'en'] });

    if (!navigator.userAgentData) {
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => ({
          brands: [
            { brand: 'Chromium', version: '${chromeMajor}' },
            { brand: 'Google Chrome', version: '${chromeMajor}' },
            { brand: 'Not?A_Brand', version: '99' },
          ],
          mobile: false,
          platform: 'Windows',
          getHighEntropyValues: () => Promise.resolve({
            architecture: 'x86',
            bitness: '64',
            model: '',
            platformVersion: '15.0.0',
            fullVersionList: [
              { brand: 'Chromium', version: '${chromeMajor}.0.0.0' },
              { brand: 'Google Chrome', version: '${chromeMajor}.0.0.0' },
              { brand: 'Not?A_Brand', version: '99.0.0.0' },
            ],
          }),
        }),
      });
    }

    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ],
    });

    try {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({ downlink: 10, effectiveType: '4g', rtt: 50, saveData: false }),
      });
    } catch {}

    window.chrome = {
      runtime: {
        id: undefined,
        connect: () => {},
        sendMessage: () => {},
        onConnect: { addListener: () => {}, removeListener: () => {}, hasListeners: () => false },
        onMessage: { addListener: () => {}, removeListener: () => {}, hasListeners: () => false },
        getPlatformInfo: () => {},
        getManifest: () => ({}),
      },
      loadTimes: () => ({
        requestTime: Date.now() / 1000,
        startLoadTime: Date.now() / 1000,
        commitLoadTime: Date.now() / 1000,
        finishDocumentLoadTime: 0,
        finishLoadTime: 0,
        firstPaintTime: 0,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: false,
        npnNegotiatedProtocol: 'unknown',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'unknown',
      }),
      csi: () => ({ startE: Date.now(), onloadT: Date.now(), pageT: 0, tran: 15 }),
      app: { isInstalled: false, getDetails: () => null, getIsInstalled: () => false },
    };

    const _origQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: 'denied' })
        : _origQuery(parameters);

    const _origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      const imageData = _origGetImageData.apply(this, args);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i]     = Math.min(255, Math.max(0, imageData.data[i]     + (Math.random() > 0.5 ? 1 : -1)));
        imageData.data[i + 1] = Math.min(255, Math.max(0, imageData.data[i + 1] + (Math.random() > 0.5 ? 1 : -1)));
        imageData.data[i + 2] = Math.min(255, Math.max(0, imageData.data[i + 2] + (Math.random() > 0.5 ? 1 : -1)));
      }
      return imageData;
    };

    const _patchWebGL = (ctx) => {
      if (!ctx) return;
      const _orig = ctx.getParameter.bind(ctx);
      ctx.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 620, OpenGL 4.1)';
        return _orig(parameter);
      };
    };

    const _origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      const ctx = _origGetContext.apply(this, [type, ...args]);
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        _patchWebGL(ctx);
      }
      return ctx;
    };
  `;
}
