import type { AdapterSearchResult, NormalizedVacancy, VacancyAdapter } from '../types.js';
import { decodeXml } from './rss.js';
import { partitionByTitleQuery } from './titleRelevance.js';

const UA = 'job-inbox/0.1 (local mvp; personal use)';
const RSS_URL = 'https://zarplata.ru/search/vacancy/rss';

function parseItem(block: string): NormalizedVacancy | null {
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

async function searchZarplata(query: string): Promise<AdapterSearchResult> {
  const url = new URL(RSS_URL);
  url.searchParams.set('text', query);
  url.searchParams.set('work_format', 'REMOTE');
  url.searchParams.set('professional_role', '96');

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
    const item = parseItem(block);
    if (item) seen.push(item);
  }

  const { kept, dropped } = partitionByTitleQuery(seen, query);
  return { items: kept, dropped, stats: { seen: seen.length, kept: kept.length } };
}

export const zarplataAdapter: VacancyAdapter = {
  source: 'zarplata',
  search: searchZarplata,
};
