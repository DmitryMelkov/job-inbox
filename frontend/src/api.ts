export type VacancySource = 'habr' | 'hh' | 'getmatch';
export type VacancyStatus = 'new' | 'applied' | 'hidden';

export interface Vacancy {
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

export interface ScanResult {
  added: number;
  updated: number;
  errors: string[];
}

export interface ListParams {
  status?: string;
  source?: string;
  q?: string;
}

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

function toQuery(params: ListParams): string {
  const sp = new URLSearchParams();
  if (params.status) sp.set('status', params.status);
  if (params.source) sp.set('source', params.source);
  if (params.q) sp.set('q', params.q);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function fetchVacancies(params: ListParams = {}): Promise<Vacancy[]> {
  const res = await fetch(`${API_URL}/api/vacancies${toQuery(params)}`);
  if (!res.ok) throw new Error(`Не удалось загрузить вакансии (${res.status})`);
  return res.json();
}

export async function updateVacancy(
  id: number,
  patch: { status?: VacancyStatus; opened?: boolean }
): Promise<Vacancy> {
  const res = await fetch(`${API_URL}/api/vacancies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Не удалось обновить вакансию (${res.status})`);
  return res.json();
}

export async function runScan(queries: string[]): Promise<ScanResult> {
  const res = await fetch(`${API_URL}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Скан не удался (${res.status})`);
  }
  return res.json();
}

export type AuthStatus = Record<VacancySource, boolean>;

export interface CheckApplicationsResult {
  checked: number;
  applied: number;
  skipped: number;
  errors: string[];
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch(`${API_URL}/api/auth/status`);
  if (!res.ok) throw new Error(`Не удалось получить статус сессий (${res.status})`);
  return res.json();
}

export async function loginSource(source: VacancySource): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Логин не удался (${res.status})`);
  return data;
}

export async function checkApplications(params: {
  source?: VacancySource;
  limit?: number;
}): Promise<CheckApplicationsResult> {
  const res = await fetch(`${API_URL}/api/applications/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Проверка не удалась (${res.status})`);
  return data;
}
