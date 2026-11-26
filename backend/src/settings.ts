import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultQueries } from './scan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.resolve(__dirname, '../data/settings.json');

export interface AppSettings {
  queries: string[];
  autoScanEnabled: boolean;
  /** Минуты между автосканами. */
  intervalMinutes: number;
  /** Непросмотренные новые с момента последнего ack. */
  unreadNewCount: number;
  lastScanAt: string | null;
  lastAdded: number;
}

const DEFAULT_INTERVAL_MINUTES = 10;

function normalizeQueries(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map(String)
      .map((q) => q.trim())
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((q) => q.trim())
      .filter(Boolean);
  }
  return defaultQueries();
}

function clampInterval(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_INTERVAL_MINUTES;
  }
  return Math.min(120, Math.max(3, Math.round(n)));
}

function defaults(): AppSettings {
  return {
    queries: defaultQueries(),
    autoScanEnabled: true,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    unreadNewCount: 0,
    lastScanAt: null,
    lastAdded: 0,
  };
}

function ensureDir(): void {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readSettings(): AppSettings {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      const initial = defaults();
      writeSettings(initial);
      return initial;
    }
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) as Partial<AppSettings>;
    const base = defaults();
    return {
      queries: normalizeQueries(raw.queries ?? base.queries),
      autoScanEnabled: raw.autoScanEnabled !== false,
      intervalMinutes: clampInterval(raw.intervalMinutes ?? base.intervalMinutes),
      unreadNewCount: Math.max(0, Number(raw.unreadNewCount) || 0),
      lastScanAt: typeof raw.lastScanAt === 'string' ? raw.lastScanAt : null,
      lastAdded: Math.max(0, Number(raw.lastAdded) || 0),
    };
  } catch {
    return defaults();
  }
}

export function writeSettings(next: AppSettings): AppSettings {
  ensureDir();
  const normalized: AppSettings = {
    queries: normalizeQueries(next.queries),
    autoScanEnabled: Boolean(next.autoScanEnabled),
    intervalMinutes: clampInterval(next.intervalMinutes),
    unreadNewCount: Math.max(0, Math.floor(Number(next.unreadNewCount) || 0)),
    lastScanAt: next.lastScanAt,
    lastAdded: Math.max(0, Math.floor(Number(next.lastAdded) || 0)),
  };
  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  const current = readSettings();
  return writeSettings({
    ...current,
    ...patch,
    queries: patch.queries !== undefined ? normalizeQueries(patch.queries) : current.queries,
    intervalMinutes:
      patch.intervalMinutes !== undefined
        ? clampInterval(patch.intervalMinutes)
        : current.intervalMinutes,
  });
}

/** После успешного скана: persist queries, lastScan*, unread. */
export function recordScanFinished(queries: string[], added: number): AppSettings {
  const current = readSettings();
  const cleaned = normalizeQueries(queries);
  return writeSettings({
    ...current,
    queries: cleaned.length ? cleaned : current.queries,
    lastScanAt: new Date().toISOString(),
    lastAdded: Math.max(0, added),
    unreadNewCount: current.unreadNewCount + Math.max(0, added),
  });
}

export function ackUnread(): AppSettings {
  const current = readSettings();
  if (current.unreadNewCount === 0) {
    return current;
  }
  return patchSettings({ unreadNewCount: 0 });
}

export function settingsPathForTests(): string {
  return SETTINGS_PATH;
}
