import type { Page } from 'playwright';
import type { VacancySource } from '../types.js';
import { sleep } from './session.js';

export type ApplyCheckResult = 'applied' | 'not_applied' | 'unknown';

async function isVisible(page: Page, locator: string): Promise<boolean> {
  return page
    .locator(locator)
    .first()
    .isVisible()
    .catch(() => false);
}

async function waitMarkers(page: Page, selector: string, timeoutMs: number): Promise<void> {
  await Promise.race([
    page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs }),
    sleep(timeoutMs),
  ]).catch(() => undefined);
}

async function detectHh(page: Page): Promise<ApplyCheckResult> {
  await waitMarkers(
    page,
    '[data-qa="vacancy-response-link-top"], [data-qa="vacancy-response-link-bottom"], text=Вы откликнулись, text=Откликнуться, text=Отклик другим резюме, text=Вам отказали, text=Вас пригласили',
    3500,
  );

  if (
    (await isVisible(page, 'text="Вы откликнулись"')) ||
    (await isVisible(page, 'text="Отклик другим резюме"')) ||
    (await isVisible(page, 'text="Отклик отправлен"')) ||
    (await isVisible(page, 'text="Вам отказали"')) ||
    (await isVisible(page, 'text="Вас пригласили"'))
  ) {
    return 'applied';
  }

  if (
    (await isVisible(page, '[data-qa="vacancy-response-link-top"]')) ||
    (await isVisible(page, '[data-qa="vacancy-response-link-bottom"]')) ||
    (await isVisible(page, 'button:text-is("Откликнуться")')) ||
    (await isVisible(page, 'a:text-is("Откликнуться")'))
  ) {
    return 'not_applied';
  }

  return 'unknown';
}

async function detectHabr(page: Page): Promise<ApplyCheckResult> {
  await waitMarkers(page, 'text=Посмотреть отклик, text=Вы откликнулись, text=Откликнуться', 3500);

  if (
    (await isVisible(page, 'text="Посмотреть отклик"')) ||
    (await isVisible(page, 'a:text-is("Посмотреть отклик")')) ||
    (await isVisible(page, 'button:text-is("Посмотреть отклик")')) ||
    (await isVisible(page, 'text="Вы откликнулись"'))
  ) {
    return 'applied';
  }

  if (
    (await isVisible(page, 'button:text-is("Откликнуться")')) ||
    (await isVisible(page, 'a:text-is("Откликнуться")'))
  ) {
    return 'not_applied';
  }

  return 'unknown';
}

/** Надёжнее UI: у залогиненного getmatch в /api/offers/:id есть application.applied_at */
async function detectGetmatchViaApi(page: Page): Promise<ApplyCheckResult | null> {
  const idMatch = page.url().match(/\/vacancies\/(\d+)/);
  if (!idMatch) return null;
  const offerId = idMatch[1];

  return page
    .evaluate(async (id) => {
      try {
        const res = await fetch(`/api/offers/${id}`, {
          credentials: 'include',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          application?: { applied_at?: string | null } | null;
        };
        if (data.application?.applied_at) return 'applied';
        return 'not_applied';
      } catch {
        return null;
      }
    }, offerId)
    .catch(() => null);
}

async function detectGetmatch(page: Page): Promise<ApplyCheckResult> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await sleep(300);

  const fromApi = await detectGetmatchViaApi(page);
  if (fromApi) return fromApi;

  // Fallback по UI — только точные маркеры карточки (не пункт меню /applications)
  await waitMarkers(
    page,
    'text=Вы откликнулись на эту вакансию, text=Посмотреть отклик, text=Откликнуться, text=Быстрый отклик',
    3500,
  );

  if (
    (await isVisible(page, 'text="Вы откликнулись на эту вакансию"')) ||
    (await isVisible(page, 'button:text-is("Посмотреть отклик")')) ||
    (await isVisible(page, 'a:text-is("Посмотреть отклик")'))
  ) {
    return 'applied';
  }

  if (
    (await isVisible(page, 'button:text-is("Откликнуться")')) ||
    (await isVisible(page, 'button:text-is("Быстрый отклик")')) ||
    (await isVisible(page, 'button:has-text("Быстрый отклик")')) ||
    (await isVisible(page, 'a:text-is("Откликнуться")'))
  ) {
    return 'not_applied';
  }

  return 'unknown';
}

export async function detectApplied(source: VacancySource, page: Page): Promise<ApplyCheckResult> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await sleep(250);

  if (source === 'hh') return detectHh(page);
  if (source === 'habr') return detectHabr(page);
  return detectGetmatch(page);
}

export async function checkVacancyApplied(
  source: VacancySource,
  page: Page,
  url: string,
): Promise<ApplyCheckResult> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch {
    return 'unknown';
  }
  return detectApplied(source, page);
}
