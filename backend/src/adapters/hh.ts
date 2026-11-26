import type { AdapterSearchResult, NormalizedVacancy, VacancyAdapter } from '../types.js';
import { decodeXml } from './rss.js';
import { partitionByTitleQuery } from './titleRelevance.js';

const UA = 'job-inbox/0.1 (local mvp; personal use)';
const PER_PAGE = 50;
const MAX_PAGES = Number(process.env.HH_MAX_PAGES || 20);

/** HH: «Программист, разработчик» — отсекает аналитиков/QA/DevOps на уровне API */
const ROLE_DEVELOPER = '96';

interface HhVacancy {
  id: string;
  name: string;
  alternate_url?: string;
  published_at?: string;
  salary?: { from?: number | null; to?: number | null; currency?: string } | null;
  employer?: { name?: string } | null;
}

interface HhSearchResponse {
  items?: HhVacancy[];
  pages?: number;
  found?: number;
}

function formatSalary(salary: HhVacancy['salary']): string | null {
  if (!salary) return null;
  const currency = salary.currency ?? 'RUR';
  if (salary.from && salary.to) return `${salary.from}–${salary.to} ${currency}`;
  if (salary.from) return `от ${salary.from} ${currency}`;
  if (salary.to) return `до ${salary.to} ${currency}`;
  return null;
}

function mapItem(item: HhVacancy): NormalizedVacancy {
  return {
    source: 'hh',
    externalId: item.id,
    title: item.name,
    company: item.employer?.name || 'Неизвестно',
    url: item.alternate_url || `https://hh.ru/vacancy/${item.id}`,
    salary: formatSalary(item.salary),
    publishedAt: item.published_at || null,
  };
}

function buildSearchParams(query: string, page: number): URLSearchParams {
  const params = new URLSearchParams({
    text: query,
    per_page: String(PER_PAGE),
    page: String(page),
    schedule: 'remote',
  });
  // Сужаем выдачу до разработчиков (не аналитики / QA / поддержка)
  params.append('professional_role', ROLE_DEVELOPER);
  return params;
}

async function fetchHhPage(query: string, page: number): Promise<HhSearchResponse> {
  const params = buildSearchParams(query, page);

  const res = await fetch(`https://api.hh.ru/vacancies?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
      'HH-User-Agent': UA,
    },
  });

  if (res.status === 403) {
    throw Object.assign(new Error('HH API 403'), { code: 'HH_API_FORBIDDEN' });
  }
  if (!res.ok) {
    throw new Error(`hh API: HTTP ${res.status}`);
  }

  return (await res.json()) as HhSearchResponse;
}

async function searchViaApi(query: string): Promise<AdapterSearchResult> {
  const seen: NormalizedVacancy[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages && page < MAX_PAGES) {
    const data = await fetchHhPage(query, page);
    if (page === 0) {
      totalPages = Math.max(1, Number(data.pages || 1));
    }

    for (const item of data.items ?? []) {
      seen.push(mapItem(item));
    }

    if (!data.items?.length) break;
    page += 1;
  }

  const { kept, dropped } = partitionByTitleQuery(seen, query);
  return { items: kept, dropped, stats: { seen: seen.length, kept: kept.length } };
}

async function searchViaRss(query: string): Promise<AdapterSearchResult> {
  const params = new URLSearchParams({
    text: query,
    schedule: 'remote',
    items_on_page: '50',
    professional_role: ROLE_DEVELOPER,
  });

  const res = await fetch(`https://hh.ru/search/vacancy/rss?${params.toString()}`, {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      'User-Agent': UA,
    },
  });

  if (!res.ok) {
    throw new Error(`hh RSS: HTTP ${res.status}`);
  }

  const xml = await res.text();
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const seen: NormalizedVacancy[] = [];

  for (const match of blocks) {
    const block = match[1];
    const title = decodeXml((block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim());
    const link = decodeXml((block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim());
    const pubDate = decodeXml((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim());
    const description = decodeXml(
      (block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '').trim(),
    );

    if (!link || !title) continue;

    const idMatch = link.match(/vacancy\/(\d+)/);
    const companyMatch = description.match(/компани[яи]:?\s*([^<\n]+)/i);

    seen.push({
      source: 'hh',
      externalId: idMatch?.[1] || link,
      title,
      company: companyMatch?.[1]?.trim() || 'Неизвестно',
      url: link,
      salary: null,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }

  const { kept, dropped } = partitionByTitleQuery(seen, query);
  return { items: kept, dropped, stats: { seen: seen.length, kept: kept.length } };
}

async function searchHh(query: string): Promise<AdapterSearchResult> {
  try {
    return await searchViaApi(query);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'HH_API_FORBIDDEN') {
      return searchViaRss(query);
    }
    try {
      return await searchViaRss(query);
    } catch {
      throw err;
    }
  }
}

export const hhAdapter: VacancyAdapter = {
  source: 'hh',
  search: searchHh,
};
