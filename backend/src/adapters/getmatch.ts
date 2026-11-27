import type { AdapterSearchResult, NormalizedVacancy, VacancyAdapter } from '../types.js';
import { partitionByTitleQuery } from './titleRelevance.js';

const BASE = 'https://getmatch.ru';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const LIMIT = 50;
/** 0 = до конца выдачи API. */
const MAX_PAGES = Number(process.env.GETMATCH_MAX_PAGES || 0);
const SAFETY_MAX_PAGES = 100;

/** Спеки getmatch из /api/specializations */
const SPEC_FRONTEND = 'js_frontend';
const SPEC_FULLSTACK = 'fullstack';

interface GetmatchCompany {
  name?: string;
  url?: string;
  logotype?: string;
}

interface GetmatchOffer {
  id: number | string;
  position?: string;
  url?: string;
  published_at?: string;
  salary_description?: string;
  company?: GetmatchCompany;
  location_items?: { format?: string; label?: string }[];
  application?: { applied_at?: string | null; id?: string | number } | null;
}

interface GetmatchOffersResponse {
  meta?: { total?: number; offset?: number; limit?: number };
  offers?: GetmatchOffer[];
}

function specsForQuery(query: string): string[] {
  const q = query.toLowerCase();
  // Стек может быть размечен и как frontend, и как fullstack
  if (/(react|vue|angular|next|javascript|typescript)/.test(q)) {
    return [SPEC_FRONTEND, SPEC_FULLSTACK];
  }
  if (/(fullstack|full-stack|фуллстек|фулстек)/.test(q)) return [SPEC_FULLSTACK];
  if (/(frontend|front-end|фронт)/.test(q)) return [SPEC_FRONTEND];
  return [SPEC_FRONTEND, SPEC_FULLSTACK];
}

function absoluteUrl(pathOrUrl: string | undefined, id: string | number): string {
  if (pathOrUrl?.startsWith('http')) return pathOrUrl;
  if (pathOrUrl?.startsWith('/')) return `${BASE}${pathOrUrl}`;
  return `${BASE}/vacancies/${id}`;
}

function mapOffer(offer: GetmatchOffer): NormalizedVacancy {
  const id = String(offer.id);
  return {
    source: 'getmatch',
    externalId: id,
    title: offer.position?.trim() || 'Без названия',
    company: offer.company?.name?.trim() || 'Неизвестно',
    url: absoluteUrl(offer.url, id),
    salary: offer.salary_description?.trim() || null,
    publishedAt: offer.published_at || null,
  };
}

async function fetchOffersPage(spec: string, offset: number): Promise<GetmatchOffersResponse> {
  const params = new URLSearchParams({
    p: String(Math.floor(offset / LIMIT) + 1),
    offset: String(offset),
    limit: String(LIMIT),
  });
  params.append('sp', spec);
  params.append('l', 'remote');

  const res = await fetch(`${BASE}/api/offers?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': UA,
    },
  });

  if (!res.ok) {
    throw new Error(`getmatch offers: HTTP ${res.status}`);
  }

  return (await res.json()) as GetmatchOffersResponse;
}

async function searchBySpec(spec: string): Promise<NormalizedVacancy[]> {
  const candidates: NormalizedVacancy[] = [];
  let offset = 0;
  let total = Infinity;
  let page = 0;

  const pageLimit = MAX_PAGES > 0 ? MAX_PAGES : SAFETY_MAX_PAGES;
  while (offset < total && page < pageLimit) {
    const data = await fetchOffersPage(spec, offset);
    total = Number(data.meta?.total ?? 0);
    const offers = data.offers ?? [];
    if (offers.length === 0) break;

    for (const offer of offers) {
      candidates.push(mapOffer(offer));
    }

    offset += offers.length;
    page += 1;
    if (offers.length < LIMIT) break;
  }

  return candidates;
}

async function searchGetmatch(query: string): Promise<AdapterSearchResult> {
  const specs = specsForQuery(query);
  const batches = await Promise.all(specs.map((spec) => searchBySpec(spec)));
  const seenMap = new Map<string, NormalizedVacancy>();
  for (const item of batches.flat()) {
    seenMap.set(item.externalId, item);
  }
  const { kept, dropped } = partitionByTitleQuery([...seenMap.values()], query);
  return { items: kept, dropped, stats: { seen: seenMap.size, kept: kept.length } };
}

export const getmatchAdapter: VacancyAdapter = {
  source: 'getmatch',
  search: searchGetmatch,
};
