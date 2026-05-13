import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const BROWSER_CANDIDATES: { name: string; path: string }[] = [
  // Google Chrome
  { name: 'Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'Chrome', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'Chrome', path: path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe') },
  // Brave
  { name: 'Brave', path: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
  { name: 'Brave', path: 'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
  { name: 'Brave', path: path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe') },
  // Microsoft Edge
  { name: 'Edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'Edge', path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
];

let cachedPath: string = '';

export function getBrowserExecutablePath(): string {
  if (cachedPath) return cachedPath;

  for (const candidate of BROWSER_CANDIDATES) {
    if (fs.existsSync(candidate.path)) {
      console.log(`[browser] Usando ${candidate.name}: ${candidate.path}`);
      cachedPath = candidate.path;
      return cachedPath;
    }
  }

  return '';
}

export function getChromiumExecutable(): string {
  return getBrowserExecutablePath();
}
