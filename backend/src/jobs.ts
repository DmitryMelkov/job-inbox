import { randomUUID } from 'node:crypto';
import {
  checkApplications,
  isApplicationsBusy,
  type CheckApplicationsOptions,
  type CheckApplicationsResult,
} from './applications.js';
import { runScan } from './scan.js';
import { recordScanFinished } from './settings.js';
import type { ScanResult, ScanSourceStats, VacancySource } from './types.js';

export type JobKind = 'scan' | 'applications';
export type JobPhase = 'queued' | 'running' | 'done' | 'error';

export interface JobProgress {
  current: number;
  total: number;
  message: string;
}

export interface JobRecord {
  id: string;
  kind: JobKind;
  phase: JobPhase;
  progress: JobProgress;
  result?: ScanResult | CheckApplicationsResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const jobs = new Map<string, JobRecord>();
const MAX_JOBS = 40;

let scanBusy = false;

export function isScanBusy(): boolean {
  return scanBusy;
}

function touch(job: JobRecord): void {
  job.updatedAt = new Date().toISOString();
  jobs.set(job.id, job);
}

function pruneJobs(): void {
  if (jobs.size <= MAX_JOBS) return;
  const sorted = [...jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  while (jobs.size > MAX_JOBS && sorted.length) {
    const old = sorted.shift();
    if (old && (old.phase === 'done' || old.phase === 'error')) {
      jobs.delete(old.id);
    } else {
      break;
    }
  }
}

function createJob(kind: JobKind, total: number, message: string): JobRecord {
  const now = new Date().toISOString();
  const job: JobRecord = {
    id: randomUUID(),
    kind,
    phase: 'queued',
    progress: { current: 0, total, message },
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);
  pruneJobs();
  return job;
}

export function getJob(id: string): JobRecord | null {
  return jobs.get(id) ?? null;
}

export function startScanJob(queries: string[]): JobRecord {
  if (scanBusy || isApplicationsBusy()) {
    throw Object.assign(new Error('Сейчас уже идёт скан, логин или проверка откликов'), {
      code: 'BUSY',
    });
  }

  const cleaned = queries.map((q) => q.trim()).filter(Boolean);
  const job = createJob('scan', Math.max(cleaned.length, 1), 'Запуск скана…');
  scanBusy = true;
  job.phase = 'running';
  touch(job);

  void (async () => {
    try {
      const result = await runScan(cleaned, {
        onProgress: (current, total, message) => {
          job.progress = { current, total, message };
          touch(job);
        },
      });
      job.result = result;
      job.phase = 'done';
      job.progress = {
        current: job.progress.total,
        total: job.progress.total,
        message: formatScanDoneMessage(result),
      };
      touch(job);
      try {
        recordScanFinished(cleaned, result.added);
      } catch (persistErr) {
        console.warn('[scan] не удалось сохранить settings после скана:', persistErr);
      }
    } catch (err) {
      job.phase = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      job.progress.message = job.error;
      touch(job);
    } finally {
      scanBusy = false;
    }
  })();

  return job;
}

export function startApplicationsJob(options: CheckApplicationsOptions = {}): JobRecord {
  if (scanBusy || isApplicationsBusy()) {
    throw Object.assign(new Error('Сейчас уже идёт скан, логин или проверка откликов'), {
      code: 'BUSY',
    });
  }

  const job = createJob('applications', options.limit ?? 30, 'Запуск проверки откликов…');
  job.phase = 'running';
  touch(job);

  void (async () => {
    try {
      const result = await checkApplications({
        ...options,
        onProgress: (current, total, message) => {
          job.progress = { current, total, message };
          touch(job);
        },
      });
      job.result = result;
      job.phase = 'done';
      job.progress = {
        current: result.checked + result.skipped,
        total: Math.max(job.progress.total, result.checked + result.skipped),
        message: `Готово: проверено ${result.checked}, откликов ${result.applied}`,
      };
      touch(job);
    } catch (err) {
      const code = (err as { code?: string }).code;
      job.phase = 'error';
      job.error = err instanceof Error ? err.message : String(err);
      if (code === 'BUSY') job.error = 'Проверка уже выполняется';
      job.progress.message = job.error;
      touch(job);
    }
  })();

  return job;
}

function formatScanDoneMessage(result: ScanResult): string {
  const sources: ScanSourceStats[] = result.sources ?? [];
  const drops = sources
    .map((s) => `${String(s.source)} ${String(s.kept)}/${String(s.seen)}`)
    .join(', ');
  return `Готово: +${result.added}, обновлено ${result.updated}. Title: ${drops}`;
}

export type { VacancySource };
