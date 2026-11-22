import type { AdapterSearchResult, NormalizedVacancy, VacancyAdapter } from '../types.js';
import { partitionByTitleQuery } from './titleRelevance.js';

const BASE = 'https://career.habr.com';
const PER_PAGE = 50;
const MAX_PAGES = Number(process.env.HABR_MAX_PAGES || 20);

/** Специализации Habr: 3 = frontend, 4 = fullstack */
const SPEC_FRONTEND = 3;
const SPEC_FULLSTACK = 4;

interface HabrVacancy {
  id: number | string;
  title?: string;
  href?: string;
  remoteWork?: boolean;
  publishedDate?: string | { date?: string; title?: string };
  salary?:
    | string
    | { from?: number | null; to?: number | null; currency?: string | null; formatted?: string }
    | null;
  company?: { title?: string; name?: string } | null;
  divisions?: { title?: string; href?: string }[] | null;
}

interface HabrResponse {
  list?: HabrVacancy[];
  meta?: { totalPages?: number; currentPage?: number; totalResults?: number };
}

function formatSalary(salary: HabrVacancy['salary']): string | null {
  if (!salary) return null;
  if (typeof salary === 'string') return salary || null;
  if (salary.formatted) return salary.formatted;
  const from = salary.from ? String(salary.from) : null;
  const to = salary.to ? String(salary.to) : null;
  const currency = salary.currency ?? 'RUR';
  if (from && to) return `${from}–${to} ${currency}`;
  if (from) return `от ${from} ${currency}`;
  if (to) return `до ${to} ${currency}`;
  return null;
}

function publishedAt(value: HabrVacancy['publishedDate']): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.date || null;
}

function mapItem(item: HabrVacancy): NormalizedVacancy {
  const href = item.href?.startsWith('http')
    ? item.href
    : `${BASE}${item.href ?? `/vacancies/${item.id}`}`;

  return {
    source: 'habr',
    externalId: String(item.id),
    title: item.title?.trim() || 'Без названия',
    company: item.company?.title || item.company?.name || 'Неизвестно',
    url: href,
    salary: formatSalary(item.salary),
    publishedAt: publishedAt(item.publishedDate),
  };
}

/** Какие s[] слать в API под наш запрос. */
function specsForQuery(query: string): number[] {
  const q = query.toLowerCase();
  // Стек (react/vue/…) может висеть и на frontend, и на fullstack specialty
  if (/(react|vue|angular|next|javascript|typescript)/.test(q)) {
    return [SPEC_FRONTEND, SPEC_FULLSTACK];
  }
  if (/(fullstack|full-stack|фуллстек|фулстек)/.test(q)) return [SPEC_FULLSTACK];
  if (/(frontend|front-end|фронт)/.test(q)) return [SPEC_FRONTEND];
  return [SPEC_FRONTEND, SPEC_FULLSTACK];
}

function isFrontOrFullstackDivision(item: HabrVacancy): boolean {
  const hrefs = (item.divisions ?? []).map((d) => d.href || '');
  if (hrefs.length === 0) return true;
  return hrefs.some((href) => /\/(frontend|fullstack)(\/|$)/i.test(href));
}

async function fetchHabrPage(query: string, page: number, specId: number): Promise<HabrResponse> {
  const params = new URLSearchParams({
    // Текст оставляем мягким: специализация режет мусор, q уточняет стек (react и т.п.)
    q: query,
    sort: 'date',
    page: String(page),
    per_page: String(PER_PAGE),
    remote: 'true',
  });
  params.append('s[]', String(specId));

  const res = await fetch(`${BASE}/api/frontend/vacancies?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'job-inbox/0.1 (local mvp)',
    },
  });

  if (!res.ok) {
    throw new Error(`Habr: HTTP ${res.status}`);
  }

  return (await res.json()) as HabrResponse;
}

async function searchHabrBySpec(query: string, specId: number): Promise<NormalizedVacancy[]> {
  const candidates: NormalizedVacancy[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= MAX_PAGES) {
    const data = await fetchHabrPage(query, page, specId);
    if (page === 1) {
      totalPages = Math.max(1, Number(data.meta?.totalPages || 1));
    }

    candidates.push(
      ...(data.list ?? [])
        .filter((item) => item.remoteWork === true)
        .filter(isFrontOrFullstackDivision)
        .map(mapItem),
    );

    if (!data.list?.length) break;
    page += 1;
  }

  return candidates;
}

async function searchHabr(query: string): Promise<AdapterSearchResult> {
  const specs = specsForQuery(query);
  const batches = await Promise.all(specs.map((specId) => searchHabrBySpec(query, specId)));
  const seenMap = new Map<string, NormalizedVacancy>();
  for (const item of batches.flat()) {
    seenMap.set(item.externalId, item);
  }
  const { kept, dropped } = partitionByTitleQuery([...seenMap.values()], query);
  return { items: kept, dropped, stats: { seen: seenMap.size, kept: kept.length } };
}

export const habrAdapter: VacancyAdapter = {
  source: 'habr',
  search: searchHabr,
};
