import type { NormalizedVacancy, VacancyRow, VacancySource } from './types.js';

let lastDropped: VacancyRow[] = [];
let updatedAt: string | null = null;

function toRow(item: NormalizedVacancy, index: number): VacancyRow {
  return {
    id: -(index + 1),
    source: item.source,
    external_id: item.externalId,
    title: item.title,
    company: item.company,
    url: item.url,
    salary: item.salary,
    published_at: item.publishedAt,
    status: 'new',
    opened: false,
    created_at: updatedAt || new Date().toISOString(),
  };
}

export function setLastDropped(items: NormalizedVacancy[]): void {
  updatedAt = new Date().toISOString();
  const deduped = new Map<string, NormalizedVacancy>();
  for (const item of items) {
    deduped.set(`${item.source}:${item.externalId}`, item);
  }
  lastDropped = [...deduped.values()].map((item, index) => toRow(item, index));
}

export function listLastDropped(
  filters: {
    source?: string;
    q?: string;
  } = {},
): { items: VacancyRow[]; updatedAt: string | null } {
  let items = lastDropped;
  if (filters.source) {
    items = items.filter((row) => row.source === (filters.source as VacancySource));
  }
  if (filters.q?.trim()) {
    const needle = filters.q.trim().toLowerCase();
    items = items.filter(
      (row) =>
        row.title.toLowerCase().includes(needle) || row.company.toLowerCase().includes(needle),
    );
  }
  return { items, updatedAt };
}
