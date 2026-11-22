import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkApplications, isApplicationsBusy } from './applications.js';
import { loginWithBrowser } from './browser/login.js';
import { listSessionStatus } from './browser/session.js';
import { listVacancies, updateVacancy } from './db.js';
import { defaultQueries, runScan } from './scan.js';
import type { VacancySource, VacancyStatus } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = Number(process.env.PORT || 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const STATUSES: VacancyStatus[] = ['new', 'applied', 'hidden'];
const SOURCES: VacancySource[] = ['hh', 'habr', 'getmatch'];

let loginBusy = false;

const app = express();
app.use(
  cors({
    origin: CORS_ORIGIN,
  })
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/vacancies', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const source = typeof req.query.source === 'string' ? req.query.source : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(listVacancies({ status, source, q }));
});

app.patch('/api/vacancies/:id', (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status as VacancyStatus | undefined;
  const opened = req.body?.opened as boolean | undefined;

  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Некорректный id' });
    return;
  }

  const hasStatus = status !== undefined;
  const hasOpened = typeof opened === 'boolean';

  if (!hasStatus && !hasOpened) {
    res.status(400).json({ error: 'Нужен status и/или opened' });
    return;
  }
  if (hasStatus && (status === undefined || !STATUSES.includes(status))) {
    res.status(400).json({ error: 'Некорректный status' });
    return;
  }

  const row = updateVacancy(id, {
    ...(hasStatus && status ? { status } : {}),
    ...(hasOpened ? { opened } : {}),
  });
  if (!row) {
    res.status(404).json({ error: 'Не найдено' });
    return;
  }
  res.json(row);
});

app.post('/api/scan', async (req, res) => {
  const bodyQueries = Array.isArray(req.body?.queries)
    ? (req.body.queries as unknown[]).map(String)
    : typeof req.body?.queries === 'string'
      ? String(req.body.queries).split(',')
      : defaultQueries();

  try {
    const result = await runScan(bodyQueries);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/auth/status', (_req, res) => {
  res.json(listSessionStatus());
});

app.post('/api/auth/login', async (req, res) => {
  const source = req.body?.source as VacancySource | undefined;
  if (!source || !SOURCES.includes(source)) {
    res.status(400).json({ error: 'Нужен source: hh | habr | getmatch' });
    return;
  }
  if (loginBusy || isApplicationsBusy()) {
    res.status(409).json({ error: 'Сейчас уже идёт логин или проверка откликов' });
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

app.post('/api/applications/check', async (req, res) => {
  if (loginBusy || isApplicationsBusy()) {
    res.status(409).json({ error: 'Сейчас уже идёт логин или проверка откликов' });
    return;
  }

  const sourceRaw = req.body?.source as string | undefined;
  const source =
    sourceRaw && SOURCES.includes(sourceRaw as VacancySource)
      ? (sourceRaw as VacancySource)
      : undefined;
  const limit = typeof req.body?.limit === 'number' ? req.body.limit : undefined;

  try {
    const result = await checkApplications({ source, limit });
    res.json(result);
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
});
