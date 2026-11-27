export const VACANCY_SOURCES = ['hh', 'habr', 'getmatch', 'zarplata'] as const;
export type VacancySource = (typeof VACANCY_SOURCES)[number];

/** Источники с Playwright-логином и проверкой откликов. */
export const APPLICATION_SOURCES = VACANCY_SOURCES;
export type ApplicationSource = VacancySource;

export function isApplicationSource(value: unknown): value is ApplicationSource {
  return APPLICATION_SOURCES.some((source) => source === value);
}

/** hh и Зарплата.ру — один контур HeadHunter, зеркала по externalId. */
export function hhFamilyTwin(source: VacancySource): 'hh' | 'zarplata' | null {
  if (source === 'hh') return 'zarplata';
  if (source === 'zarplata') return 'hh';
  return null;
}

/** new — со скана; applied — после проверки откликов; hidden — вручную убрана */
export type VacancyStatus = 'new' | 'applied' | 'hidden';

export interface NormalizedVacancy {
  source: VacancySource;
  externalId: string;
  title: string;
  company: string;
  url: string;
  salary: string | null;
  publishedAt: string | null;
}

export interface VacancyRow {
  id: number;
  source: VacancySource;
  external_id: string;
  title: string;
  company: string;
  url: string;
  salary: string | null;
  published_at: string | null;
  status: VacancyStatus;
  opened: boolean;
  created_at: string;
}

/** seen — после API-фильтров источника; kept — после titleMatchesQuery */
export interface AdapterSearchStats {
  seen: number;
  kept: number;
}

export interface AdapterSearchResult {
  items: NormalizedVacancy[];
  dropped: NormalizedVacancy[];
  stats: AdapterSearchStats;
}

export interface VacancyAdapter {
  source: VacancySource;
  search: (query: string) => Promise<AdapterSearchResult>;
}

export interface ScanSourceStats {
  source: VacancySource;
  seen: number;
  kept: number;
  dropped: number;
}

export interface ScanResult {
  added: number;
  updated: number;
  errors: string[];
  sources: ScanSourceStats[];
}
