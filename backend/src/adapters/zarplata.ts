import type { AdapterSearchResult, NormalizedVacancy, VacancyAdapter } from '../types.js';
import { decodeXml } from './rss.js';
import { partitionByTitleQuery } from './titleRelevance.js';

const UA = 'job-inbox/0.1 (local mvp; personal use)';
const PER_PAGE = 50;
/** 0 = до конца выдачи. */
const MAX_PAGES = Number(process.env.ZARPLATA_MAX_PAGES || 0);
const SAFETY_MAX_PAGES = 100;
const ROLE_DEVELOPER = '96';
const SEARCH_URL = 'https://zarplata.ru/shards/vacancy/search';
const RSS_URL = 'https://zarplata.ru/search/vacancy/rss';

interface ZarplataCompensation {
  from?: number | null;
  to?: number | null;
  currencyCode?: string | null;
  noCompensation?: unknown;
}

interface ZarplataVacancy {
  vacancyId?: number | string;
  name?: string;
  company?: { name?: string; visibleName?: string } | null;
  compensation?: ZarplataCompensation | null;
  publicationTime?: { $?: string } | null;
  links?: { desktop?: string; mobile?: string } | null;
}

interface ZarplataSearchResult {
  vacancies?: ZarplataVacancy[];
  totalResults?: number;
  paging?: {
    lastPage?: { page?: number } | null;
    next?: { page?: number; disabled?: boolean } | null;
  } | null;
}

interface ZarplataShardsResponse {
  vacancySearchResult?: ZarplataSearchResult;
}

function formatSalary(compensation: ZarplataCompensation | null | undefined): string | null {
  if (!compensation || compensation.noCompensation) return null;
  const currency = compensation.currencyCode ?? 'RUR';
  const from = compensation.from ?? null;
  const to = compensation.to ?? null;
  if (from != null && to != null) return `${from}–${to} ${currency}`;
  if (from != null) return `от ${from} ${currency}`;
  if (to != null) return `до ${to} ${currency}`;
  return null;
}

function mapItem(item: ZarplataVacancy): NormalizedVacancy | null {
  const externalId = item.vacancyId != null ? String(item.vacancyId) : '';
  const title = item.name?.trim() || '';
  if (!externalId || !title) return null;

  return {
    source: 'zarplata',
    externalId,
    title,
    company: item.company?.visibleName?.trim() || item.company?.name?.trim() || 'Неизвестно',
    url: item.links?.desktop || `https://zarplata.ru/vacancy/${externalId}`,
    salary: formatSalary(item.compensation),
    publishedAt: item.publicationTime?.$ || null,
  };
}

function buildSearchParams(query: string, page: number): URLSearchParams {
  return new URLSearchParams({
    text: query,
    work_format: 'REMOTE',
    professional_role: ROLE_DEVELOPER,
    page: String(page),
    items_on_page: String(PER_PAGE),
  });
}

async function fetchZarplataPage(query: string, page: number): Promise<ZarplataSearchResult> {
  const params = buildSearchParams(query, page);
  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw Object.assign(new Error(`Зарплата.ру search: HTTP ${response.status}`), {
      code: 'ZARPLATA_SEARCH_HTTP',
    });
  }

  const data = (await response.json()) as ZarplataShardsResponse;
  return data.vacancySearchResult ?? {};
}

function resolveTotalPages(result: ZarplataSearchResult, pageSize: number): number {
  const last = result.paging?.lastPage?.page;
  if (typeof last === 'number' && last >= 0) return last + 1;

  const total = Number(result.totalResults ?? 0);
  if (total > 0 && pageSize > 0) return Math.max(1, Math.ceil(total / pageSize));

  return 1;
}

async function searchViaApi(query: string): Promise<AdapterSearchResult> {
  const seen: NormalizedVacancy[] = [];
  let page = 0;
  let totalPages = 1;

  const pageLimit = MAX_PAGES > 0 ? MAX_PAGES : SAFETY_MAX_PAGES;
  while (page < totalPages && page < pageLimit) {
    const data = await fetchZarplataPage(query, page);
    if (page === 0) {
      totalPages = resolveTotalPages(data, PER_PAGE);
    }

    for (const item of data.vacancies ?? []) {
      const mapped = mapItem(item);
      if (mapped) seen.push(mapped);
    }

    if (!data.vacancies?.length) break;
    if (data.paging?.next?.disabled) break;
    page += 1;
  }

  const { kept, dropped } = partitionByTitleQuery(seen, query);
  return { items: kept, dropped, stats: { seen: seen.length, kept: kept.length } };
}

function parseRssItem(block: string): NormalizedVacancy | null {
  const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
  const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '').trim();
  const externalId = link.match(
    /^https:\/\/(?:[\w-]+\.)?zarplata\.ru\/vacancy\/(\d+)(?:[/?#]|$)/,
  )?.[1];
  if (!title || !externalId) return null;

  const description = decodeXml(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '');
  const company = description.match(/Вакансия компании:\s*([^<]+)/)?.[1]?.trim() ?? '';
  const salaryRaw = description
    .match(/Предполагаемый уровень месячного дохода:\s*([^<]+)/)?.[1]
    ?.trim()
    .replace(/\s+/g, ' ');
  const publishedAt = Date.parse(block.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] ?? '');

  return {
    source: 'zarplata',
    externalId,
    title,
    company: company || 'Неизвестно',
    url: link,
    salary: !salaryRaw || salaryRaw.toLowerCase() === 'не указан' ? null : salaryRaw,
    publishedAt: Number.isFinite(publishedAt) ? new Date(publishedAt).toISOString() : null,
  };
}

async function searchViaRss(query: string): Promise<AdapterSearchResult> {
  const url = new URL(RSS_URL);
  url.searchParams.set('text', query);
  url.searchParams.set('work_format', 'REMOTE');
  url.searchParams.set('professional_role', ROLE_DEVELOPER);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      'User-Agent': UA,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Зарплата.ру RSS: HTTP ${response.status}`);
  }

  const xml = await response.text();
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) {
    throw new Error('Зарплата.ру вернула некорректную RSS-ленту');
  }

  const seen: NormalizedVacancy[] = [];
  for (const [, block] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = parseRssItem(block);
    if (item) seen.push(item);
  }

  const { kept, dropped } = partitionByTitleQuery(seen, query);
  return { items: kept, dropped, stats: { seen: seen.length, kept: kept.length } };
}

async function searchZarplata(query: string): Promise<AdapterSearchResult> {
  try {
    return await searchViaApi(query);
  } catch (err) {
    try {
      return await searchViaRss(query);
    } catch {
      throw err;
    }
  }
}

export const zarplataAdapter: VacancyAdapter = {
  source: 'zarplata',
  search: searchZarplata,
};
