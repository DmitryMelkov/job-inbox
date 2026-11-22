import { getmatchAdapter } from './adapters/getmatch.js';
import { habrAdapter } from './adapters/habr.js';
import { hhAdapter } from './adapters/hh.js';
import { titleMatchesAnyQuery } from './adapters/titleRelevance.js';
import { pruneIrrelevantVacancies, upsertVacancies } from './db.js';
import type { NormalizedVacancy, ScanResult, VacancyAdapter } from './types.js';

const adapters: VacancyAdapter[] = [habrAdapter, hhAdapter, getmatchAdapter];

function dedupe(items: NormalizedVacancy[]): NormalizedVacancy[] {
  const map = new Map<string, NormalizedVacancy>();
  for (const item of items) {
    map.set(`${item.source}:${item.externalId}`, item);
  }
  return [...map.values()];
}

export async function runScan(queries: string[]): Promise<ScanResult> {
  const cleaned = queries.map((q) => q.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return { added: 0, updated: 0, errors: ['Нет поисковых запросов'] };
  }

  const collected: NormalizedVacancy[] = [];
  const errors: string[] = [];

  for (const adapter of adapters) {
    for (const query of cleaned) {
      try {
        const items = await adapter.search(query);
        collected.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${adapter.source} [${query}]: ${message}`);
      }
    }
  }

  const unique = dedupe(collected);
  const { added, updated } = upsertVacancies(unique);

  // Чистим старый мусор (LLM/.NET / аналитик и т.п.), оставшийся от прошлых сканов
  const pruned = pruneIrrelevantVacancies((row) =>
    titleMatchesAnyQuery(row.title, cleaned)
  );
  if (pruned > 0) {
    errors.push(`очищено нерелевантных new: ${pruned}`);
  }

  return { added, updated, errors };
}

export function defaultQueries(): string[] {
  const fromEnv = process.env.SEARCH_QUERIES;
  if (fromEnv?.trim()) {
    return fromEnv.split(',').map((q) => q.trim()).filter(Boolean);
  }
  return ['frontend', 'fullstack', 'react', 'angular', 'vue'];
}
