export type VacancySource = 'habr' | 'hh' | 'getmatch';

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

export interface VacancyAdapter {
  source: VacancySource;
  search: (query: string) => Promise<NormalizedVacancy[]>;
}

export interface ScanResult {
  added: number;
  updated: number;
  errors: string[];
}
