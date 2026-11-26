import { checkVacancyApplied } from './browser/checkApplied.js';
import { hasSession, openPersistentContext, randomDelay, sleep } from './browser/session.js';
import { listVacancies, updateVacancy } from './db.js';
import { isApplicationSource, type ApplicationSource, type VacancyRow } from './types.js';

export interface CheckApplicationsOptions {
  source?: ApplicationSource;
  limit?: number;
  onProgress?: (current: number, total: number, message: string) => void;
}

export interface CheckApplicationsResult {
  checked: number;
  applied: number;
  skipped: number;
  errors: string[];
}

let busy = false;

export function isApplicationsBusy(): boolean {
  return busy;
}

export async function checkApplications(
  options: CheckApplicationsOptions = {},
): Promise<CheckApplicationsResult> {
  if (busy) {
    throw Object.assign(new Error('Проверка уже выполняется'), { code: 'BUSY' });
  }

  busy = true;
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 50);
  const errors: string[] = [];
  let checked = 0;
  let applied = 0;
  let skipped = 0;

  try {
    const all = (await listVacancies({ source: options.source })).filter(
      (v): v is VacancyRow & { source: ApplicationSource } => isApplicationSource(v.source),
    );
    const candidates = [
      ...all.filter((v) => v.status !== 'applied'),
      ...all.filter((v) => v.status === 'applied'),
    ].slice(0, limit);

    if (candidates.length === 0) {
      return { checked: 0, applied: 0, skipped: 0, errors: ['Нет вакансий для проверки'] };
    }

    const total = candidates.length;
    options.onProgress?.(0, total, 'Подготовка…');

    const bySource = new Map<ApplicationSource, typeof candidates>();
    for (const row of candidates) {
      const list = bySource.get(row.source) || [];
      list.push(row);
      bySource.set(row.source, list);
    }

    let done = 0;

    for (const [source, rows] of bySource) {
      if (!hasSession(source)) {
        errors.push(`${source}: нет сохранённой сессии — сначала «Войти»`);
        skipped += rows.length;
        done += rows.length;
        options.onProgress?.(done, total, `${source}: нет сессии`);
        continue;
      }

      let context;
      try {
        context = await openPersistentContext(source);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${source}: не удалось открыть браузер (${message})`);
        skipped += rows.length;
        done += rows.length;
        options.onProgress?.(done, total, `${source}: ошибка браузера`);
        continue;
      }

      const page = context.pages()[0] || (await context.newPage());

      try {
        for (const row of rows) {
          options.onProgress?.(done, total, `${source}: ${row.title.slice(0, 48)}…`);
          try {
            const result = await checkVacancyApplied(source, page, row.url);
            checked += 1;
            if (result === 'applied') {
              await updateVacancy(row.id, { status: 'applied', opened: true });
              applied += 1;
            } else if (result === 'not_applied') {
              if (row.status === 'applied') {
                await updateVacancy(row.id, { status: 'new', opened: true });
              }
              skipped += 1;
            } else {
              skipped += 1;
            }
          } catch (err) {
            skipped += 1;
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`${source} #${row.id}: ${message}`);
          }
          done += 1;
          options.onProgress?.(done, total, `${source}: проверено ${done}/${total}`);
          await sleep(randomDelay());
        }
      } finally {
        await context.close().catch(() => undefined);
      }
    }

    return { checked, applied, skipped, errors };
  } finally {
    busy = false;
  }
}
