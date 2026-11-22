import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormalizedVacancy, VacancyRow, VacancyStatus } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dbPath = path.join(dataDir, 'vacancies.json');

interface Store {
  nextId: number;
  vacancies: VacancyRow[];
}

function emptyStore(): Store {
  return { nextId: 1, vacancies: [] };
}

function ensureStore(): Store {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    const store = emptyStore();
    fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf8');
    return store;
  }
  const raw = fs.readFileSync(dbPath, 'utf8');
  try {
    const parsed = JSON.parse(raw) as Store;
    if (!Array.isArray(parsed.vacancies) || typeof parsed.nextId !== 'number') {
      return emptyStore();
    }
    // Миграции: opened + interesting → new
    parsed.vacancies = parsed.vacancies.map((row) => ({
      ...row,
      opened: Boolean(row.opened),
      status: (row.status as string) === 'interesting' ? 'new' : row.status,
    }));
    return parsed;
  } catch {
    return emptyStore();
  }
}

function saveStore(store: Store): void {
  fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf8');
}

export function upsertVacancies(items: NormalizedVacancy[]): { added: number; updated: number } {
  const store = ensureStore();
  let added = 0;
  let updated = 0;

  for (const item of items) {
    const existing = store.vacancies.find(
      (row) => row.source === item.source && row.external_id === item.externalId
    );

    if (existing) {
      existing.title = item.title;
      existing.company = item.company;
      existing.url = item.url;
      existing.salary = item.salary;
      existing.published_at = item.publishedAt;
      updated += 1;
    } else {
      store.vacancies.push({
        id: store.nextId++,
        source: item.source,
        external_id: item.externalId,
        title: item.title,
        company: item.company,
        url: item.url,
        salary: item.salary,
        published_at: item.publishedAt,
        status: 'new',
        opened: false,
        created_at: new Date().toISOString(),
      });
      added += 1;
    }
  }

  saveStore(store);
  return { added, updated };
}

export interface ListFilters {
  status?: string;
  source?: string;
  q?: string;
}

export function listVacancies(filters: ListFilters = {}): VacancyRow[] {
  const store = ensureStore();
  const q = filters.q?.toLowerCase();

  return store.vacancies
    .filter((row) => {
      if (filters.status) {
        if (row.status !== filters.status) return false;
      } else if (row.status === 'hidden') {
        // По умолчанию скрытые не показываем
        return false;
      }
      if (filters.source && row.source !== filters.source) return false;
      if (q) {
        const hay = `${row.title} ${row.company}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const da = Date.parse(a.published_at || a.created_at);
      const db = Date.parse(b.published_at || b.created_at);
      return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da) || b.id - a.id;
    });
}

export interface VacancyPatch {
  status?: VacancyStatus;
  opened?: boolean;
}

export function updateVacancy(id: number, patch: VacancyPatch): VacancyRow | null {
  const store = ensureStore();
  const row = store.vacancies.find((item) => item.id === id);
  if (!row) return null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.opened !== undefined) row.opened = patch.opened;
  saveStore(store);
  return row;
}

/**
 * Удаляет нерелевантные вакансии (включая ложные applied).
 * hidden не трогаем — это ручное скрытие.
 */
export function pruneIrrelevantVacancies(
  keep: (row: VacancyRow) => boolean
): number {
  const store = ensureStore();
  const before = store.vacancies.length;
  store.vacancies = store.vacancies.filter((row) => {
    if (row.status === 'hidden') return true;
    return keep(row);
  });
  const removed = before - store.vacancies.length;
  if (removed > 0) saveStore(store);
  return removed;
}
