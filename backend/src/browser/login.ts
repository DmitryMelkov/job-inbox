import type { BrowserContext, Page } from 'playwright';
import type { ApplicationSource } from '../types.js';
import { openPersistentContext, SOURCE_HOME, SOURCE_LOGIN, sleep } from './session.js';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 2000;

async function pageLooksLoggedIn(
  source: ApplicationSource,
  page: Page,
  context: BrowserContext,
): Promise<boolean> {
  const url = page.url();
  const body = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).toLowerCase();
  const cookies = await context.cookies().catch(() => []);
  const cookieNames = new Set(cookies.map((c) => c.name.toLowerCase()));

  // hh и Зарплата.ру — один стек HeadHunter (разные домены → разные сессии).
  if (source === 'hh' || source === 'zarplata') {
    if (/\/account\/login/i.test(url)) return false;

    // Явные маркеры шапки соискателя (как на скрине после входа)
    const selectors = [
      '[data-qa="mainmenu_applicantProfile"]',
      '[data-qa="mainmenu_applicant-profile"]',
      'a[href*="/applicant/profile"]',
      'a[href*="/applicant/negotiations"]',
      'a[href="/applicant/resumes"]',
      '[data-qa="mainmenu_negotiations"]',
    ];
    for (const sel of selectors) {
      if (
        (await page
          .locator(sel)
          .count()
          .catch(() => 0)) > 0
      )
        return true;
    }

    if (
      body.includes('отклики и приглашения') ||
      body.includes('резюме и профиль') ||
      (body.includes('отклики') && body.includes('резюме') && !/\/account\/login/i.test(url))
    ) {
      return true;
    }

    // cookie-сигнал авторизации hh-платформы
    if (cookieNames.has('hhtoken') || cookieNames.has('hhuid')) {
      if (!body.includes('войти как соискатель') && !/\/account\/login/i.test(url)) {
        // на главной после логина обычно есть «Отклики»
        if (body.includes('отклики') || body.includes('резюме')) return true;
      }
    }

    return false;
  }

  if (source === 'habr') {
    if (/\/login/i.test(url) && !body.includes('выйти')) return false;
    if (
      body.includes('выйти') ||
      body.includes('мой профиль') ||
      body.includes('отклики') ||
      (await page
        .locator('a[href*="/my"], a[href*="/logout"]')
        .count()
        .catch(() => 0)) > 0
    ) {
      return true;
    }
    return false;
  }

  // getmatch: классической /login нет, сессия через OTP в модалке
  if (
    (await page
      .locator('a[href="/api/auth/logout"], a[href*="/api/auth/logout"]')
      .count()
      .catch(() => 0)) > 0
  ) {
    return true;
  }
  if (
    body.includes('выйти') ||
    body.includes('мой профиль') ||
    body.includes('отклики') ||
    (await page
      .locator('a[href*="/applications"], a[href*="/profile"]')
      .count()
      .catch(() => 0)) > 0
  ) {
    return true;
  }

  // Надёжный сигнал — /api/auth/me в контексте браузера (с cookies профиля)
  const meOk = await page
    .evaluate(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        return res.ok;
      } catch {
        return false;
      }
    })
    .catch(() => false);
  return Boolean(meOk);
}

export async function loginWithBrowser(
  source: ApplicationSource,
): Promise<{ ok: true; message: string }> {
  const context = await openPersistentContext(source);
  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto(SOURCE_LOGIN[source], { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch {
    // страница могла открыться частично — даём пользователю время
  }

  if (source === 'getmatch') {
    // Открываем модалку входа, если ещё не залогинены
    const already = await pageLooksLoggedIn(source, page, context);
    if (!already) {
      const loginBtn = page.getByRole('button', { name: /^Войти$/i }).first();
      if (await loginBtn.isVisible().catch(() => false)) {
        await loginBtn.click().catch(() => undefined);
      }
    }
  }

  const started = Date.now();
  while (Date.now() - started < LOGIN_TIMEOUT_MS) {
    try {
      // если уже ушли на главную после логина — тоже ок
      if (await pageLooksLoggedIn(source, page, context)) {
        // закрепим сессию заходом на home
        await page
          .goto(SOURCE_HOME[source], { waitUntil: 'domcontentloaded', timeout: 30000 })
          .catch(() => undefined);
        await sleep(1500);
        await context.close();
        const label =
          source === 'zarplata' ? 'Зарплата.ру' : source === 'getmatch' ? 'getmatch' : source;
        return {
          ok: true,
          message:
            source === 'getmatch'
              ? 'Сессия getmatch сохранена (вход по коду). Теперь нажми «Проверить отклики».'
              : `Сессия ${label} сохранена. Теперь нажми «Проверить отклики».`,
        };
      }
    } catch {
      // окно могли закрыть / навигация
    }
    await sleep(POLL_MS);
  }

  await context.close().catch(() => undefined);
  throw new Error(
    `Таймаут логина (${source}): не удалось подтвердить вход за 5 минут. Попробуй ещё раз.`,
  );
}
