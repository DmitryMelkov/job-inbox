import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext } from 'playwright';
import type { VacancySource } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_ROOT = path.resolve(__dirname, '../../.auth');

export const SOURCE_HOME: Record<VacancySource, string> = {
  hh: 'https://hh.ru/',
  habr: 'https://career.habr.com/',
  getmatch: 'https://getmatch.ru/vacancies',
};

export const SOURCE_LOGIN: Record<VacancySource, string> = {
  hh: 'https://hh.ru/account/login',
  habr: 'https://career.habr.com/login',
  // У getmatch нет /login (404) — вход через модалку «Войти» на сайте
  getmatch: 'https://getmatch.ru/vacancies',
};

export function authDir(source: VacancySource): string {
  return path.join(AUTH_ROOT, source);
}

export function hasSession(source: VacancySource): boolean {
  const dir = authDir(source);
  if (!fs.existsSync(dir)) return false;
  // Chromium persistent profile creates Default/ or similar
  const entries = fs.readdirSync(dir);
  return entries.length > 0;
}

export function listSessionStatus(): Record<VacancySource, boolean> {
  return {
    hh: hasSession('hh'),
    habr: hasSession('habr'),
    getmatch: hasSession('getmatch'),
  };
}

export async function openPersistentContext(source: VacancySource): Promise<BrowserContext> {
  const userDataDir = authDir(source);
  fs.mkdirSync(userDataDir, { recursive: true });

  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'ru-RU',
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(minMs = 400, maxMs = 900): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}
