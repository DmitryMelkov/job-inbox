import { getmatchAdapter } from './adapters/getmatch.js';
import { habrAdapter } from './adapters/habr.js';
import { hhAdapter } from './adapters/hh.js';
import { titleMatchesAnyQuery } from './adapters/titleRelevance.js';
import { zarplataAdapter } from './adapters/zarplata.js';
import { pruneIrrelevantVacancies, upsertVacancies } from './db.js';
import { setLastDropped } from './lastDropped.js';
import type {
  NormalizedVacancy,
  ScanResult,
  ScanSourceStats,
  VacancyAdapter,
  VacancySource,
} from './types.js';

const adapters: VacancyAdapter[] = [habrAdapter, hhAdapter, getmatchAdapter, zarplataAdapter];

export interface ScanProgressCallback {
  (current: number, total: number, message: string): void;
}

function dedupe(items: NormalizedVacancy[]): NormalizedVacancy[] {
  const map = new Map<string, NormalizedVacancy>();
  for (const item of items) {
    map.set(`${item.source}:${item.externalId}`, item);
  }
  return [...map.values()];
}

function emptySourceStats(): Record<VacancySource, ScanSourceStats> {
  return {
    habr: { source: 'habr', seen: 0, kept: 0, dropped: 0 },
    hh: { source: 'hh', seen: 0, kept: 0, dropped: 0 },
    getmatch: { source: 'getmatch', seen: 0, kept: 0, dropped: 0 },
    zarplata: { source: 'zarplata', seen: 0, kept: 0, dropped: 0 },
  };
}

export async function runScan(
  queries: string[],
  options: { onProgress?: ScanProgressCallback } = {},
): Promise<ScanResult> {
  const cleaned = queries.map((q) => q.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    setLastDropped([]);
    return {
      added: 0,
      updated: 0,
      errors: ['Нет поисковых запросов'],
      sources: Object.values(emptySourceStats()),
    };
  }

  const collected: NormalizedVacancy[] = [];
  const droppedRaw: NormalizedVacancy[] = [];
  const errors: string[] = [];
  const totals = emptySourceStats();
  const totalSteps = adapters.length * cleaned.length;
  let step = 0;

  for (const adapter of adapters) {
    for (const query of cleaned) {
      step += 1;
      options.onProgress?.(step - 1, totalSteps, `${adapter.source}: «${query}»…`);
      try {
        const { items, dropped, stats } = await adapter.search(query);
        collected.push(...items);
        droppedRaw.push(...dropped);
        const row = totals[adapter.source];
        row.seen += stats.seen;
        row.kept += stats.kept;
        row.dropped += Math.max(0, stats.seen - stats.kept);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${adapter.source} [${query}]: ${message}`);
      }
      options.onProgress?.(step, totalSteps, `${adapter.source}: «${query}» готово`);
    }
  }

  options.onProgress?.(totalSteps, totalSteps, 'Сохранение…');
  const unique = dedupe(collected);
  const keptKeys = new Set(unique.map((item) => `${item.source}:${item.externalId}`));
  const onlyDropped = dedupe(droppedRaw).filter(
    (item) => !keptKeys.has(`${item.source}:${item.externalId}`),
  );
  setLastDropped(onlyDropped);

  const { added, updated } = await upsertVacancies(unique);

  const pruned = await pruneIrrelevantVacancies((row) => titleMatchesAnyQuery(row.title, cleaned));
  if (pruned > 0) {
    errors.push(`очищено нерелевантных: ${pruned}`);
  }

  return {
    added,
    updated,
    errors,
    sources: Object.values(totals),
  };
}

export function defaultQueries(): string[] {
  const fromEnv = process.env.SEARCH_QUERIES;
  if (fromEnv?.trim()) {
    return fromEnv
      .split(',')
      .map((q) => q.trim())
      .filter(Boolean);
  }
  return ['frontend', 'fullstack', 'react', 'angular', 'vue'];
}
