import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isApplicationsBusy } from './applications.js';
import { loginWithBrowser } from './browser/login.js';
import { listSessionStatus } from './browser/session.js';
import { listVacancies, updateVacancy } from './db.js';
import { getAutoscanSnapshot, rescheduleAutoscan, startAutoscanScheduler } from './autoscan.js';
import { getJob, isScanBusy, startApplicationsJob, startScanJob } from './jobs.js';
import { listLastDropped } from './lastDropped.js';
import { defaultQueries } from './scan.js';
import { ackUnread, patchSettings, readSettings, type AppSettings } from './settings.js';
import type { VacancySource, VacancyStatus } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = Number(process.env.PORT || 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const STATUSES: VacancyStatus[] = ['new', 'applied', 'hidden'];
const SOURCES: VacancySource[] = ['hh', 'habr', 'getmatch'];

let loginBusy = false;

function asBody(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readQueries(body: Record<string, unknown>): string[] {
  const raw = body.queries;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return raw.split(',');
  return defaultQueries();
}

const app = express();
app.use(
  cors({
    origin: CORS_ORIGIN,
  }),
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/vacancies', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const source = typeof req.query.source === 'string' ? req.query.source : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  try {
    res.json(await listVacancies({ status, source, q }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

/** Отрезанные title-фильтром на последнем скане (в памяти процесса). */
app.get('/api/vacancies/dropped', (req, res) => {
  const source = typeof req.query.source === 'string' ? req.query.source : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const { items, updatedAt } = listLastDropped({ source, q });
  res.json({ items, updatedAt });
});

app.patch('/api/vacancies/:id', async (req, res) => {
  const id = Number(req.params.id);
  const body = asBody(req.body);
  const status = body.status as VacancyStatus | undefined;
  const opened = body.opened as boolean | undefined;
  const hasStatus = status !== undefined;
  const hasOpened = typeof opened === 'boolean';

  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Некорректный id' });
    return;
  }

  if (!hasStatus && !hasOpened) {
    res.status(400).json({ error: 'Нужен status и/или opened' });
    return;
  }
  if (hasStatus && (status === undefined || !STATUSES.includes(status))) {
    res.status(400).json({ error: 'Некорректный status' });
    return;
  }

  try {
    const row = await updateVacancy(id, {
      ...(hasStatus && status ? { status } : {}),
      ...(hasOpened ? { opened } : {}),
    });
    if (!row) {
      res.status(404).json({ error: 'Не найдено' });
      return;
    }
    res.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/settings', (_req, res) => {
  res.json(readSettings());
});

app.patch('/api/settings', (req, res) => {
  const body = asBody(req.body);
  const patch: Partial<AppSettings> = {};

  if (body.queries !== undefined) {
    patch.queries = readQueries(body);
  }
  if (typeof body.autoScanEnabled === 'boolean') {
    patch.autoScanEnabled = body.autoScanEnabled;
  }
  if (body.intervalMinutes !== undefined) {
    patch.intervalMinutes = Number(body.intervalMinutes);
  }

  const next = patchSettings(patch);
  if (body.autoScanEnabled !== undefined || body.intervalMinutes !== undefined) {
    rescheduleAutoscan();
  }
  res.json(next);
});

app.get('/api/autoscan', (_req, res) => {
  res.json(getAutoscanSnapshot());
});

app.post('/api/autoscan/ack', (_req, res) => {
  res.json(ackUnread());
});

app.post('/api/scan', (req, res) => {
  const body = asBody(req.body);
  let queries: string[];
  if (body.queries !== undefined) {
    queries = readQueries(body);
    patchSettings({ queries });
  } else {
    // Трей / пустой body — скан по сохранённым queries.
    queries = readSettings().queries;
  }

  try {
    const job = startScanJob(queries);
    res.status(202).json(job);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'BUSY') {
      res.status(409).json({ error: (err as Error).message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(String(req.params.id));
  if (!job) {
    res.status(404).json({ error: 'Задача не найдена' });
    return;
  }
  res.json(job);
});

app.get('/api/auth/status', (_req, res) => {
  res.json(listSessionStatus());
});

app.post('/api/auth/login', async (req, res) => {
  const body = asBody(req.body);
  const source = body.source as VacancySource | undefined;
  if (!source || !SOURCES.includes(source)) {
    res.status(400).json({ error: 'Нужен source: hh | habr | getmatch' });
    return;
  }
  if (loginBusy || isApplicationsBusy() || isScanBusy()) {
    res.status(409).json({ error: 'Сейчас уже идёт логин, скан или проверка откликов' });
    return;
  }

  loginBusy = true;
  try {
    const result = await loginWithBrowser(source);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  } finally {
    loginBusy = false;
  }
});

app.post('/api/applications/check', (req, res) => {
  if (loginBusy || isApplicationsBusy() || isScanBusy()) {
    res.status(409).json({ error: 'Сейчас уже идёт логин, скан или проверка откликов' });
    return;
  }

  const body = asBody(req.body);
  const sourceRaw = body.source;
  const source =
    typeof sourceRaw === 'string' && SOURCES.includes(sourceRaw as VacancySource)
      ? (sourceRaw as VacancySource)
      : undefined;
  const limit = typeof body.limit === 'number' ? body.limit : undefined;

  try {
    const job = startApplicationsJob({ source, limit });
    res.status(202).json(job);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'BUSY') {
      res.status(409).json({ error: (err as Error).message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`job-inbox API http://localhost:${PORT}`);
  startAutoscanScheduler();
});
