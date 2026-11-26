import { isApplicationsBusy } from './applications.js';
import { isScanBusy, startScanJob } from './jobs.js';
import { readSettings } from './settings.js';

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let nextAtMs: number | null = null;

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleNext(delayMs: number): void {
  clearTimer();
  const delay = Math.max(1_000, delayMs);
  nextAtMs = Date.now() + delay;
  timer = setTimeout(() => {
    tick();
  }, delay);
}

function tick(): void {
  const settings = readSettings();
  if (!settings.autoScanEnabled) {
    console.log('[autoscan] пропуск: auto выключен');
    scheduleNext(settings.intervalMinutes * 60_000);
    return;
  }

  if (isScanBusy() || isApplicationsBusy()) {
    console.log('[autoscan] занято — повтор через 1 мин');
    scheduleNext(60_000);
    return;
  }

  const queries = settings.queries;
  if (!queries.length) {
    console.log('[autoscan] пропуск: нет queries');
    scheduleNext(settings.intervalMinutes * 60_000);
    return;
  }

  try {
    console.log(`[autoscan] запуск скана: ${queries.join(', ')}`);
    startScanJob(queries);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'BUSY') {
      console.warn('[autoscan] не удалось запустить скан:', err);
    } else {
      console.log('[autoscan] BUSY при старте — повтор через 1 мин');
      scheduleNext(60_000);
      return;
    }
  }

  scheduleNext(readSettings().intervalMinutes * 60_000);
}

/** Перезапустить таймер после смены interval / enable (сразу не сканит). */
export function rescheduleAutoscan(): void {
  if (!started) {
    return;
  }
  const settings = readSettings();
  // При включении Авто — ближайший тик через 1 мин, чтобы было видно, что жив.
  const delayMs = settings.autoScanEnabled
    ? Math.min(60_000, settings.intervalMinutes * 60_000)
    : settings.intervalMinutes * 60_000;
  scheduleNext(delayMs);
}

export function startAutoscanScheduler(): void {
  if (started) {
    return;
  }
  started = true;
  const settings = readSettings();
  // Первый тик через 1 мин после старта API (не ждать полный interval).
  const firstDelayMs = settings.autoScanEnabled
    ? Math.min(60_000, settings.intervalMinutes * 60_000)
    : settings.intervalMinutes * 60_000;
  scheduleNext(firstDelayMs);
  console.log(
    `[autoscan] включён: каждые ${settings.intervalMinutes} мин, auto=${settings.autoScanEnabled}, первый тик через ${Math.round(firstDelayMs / 1000)}с`,
  );
}

export function stopAutoscanScheduler(): void {
  started = false;
  clearTimer();
  nextAtMs = null;
}

export function getAutoscanSnapshot() {
  const settings = readSettings();
  return {
    enabled: settings.autoScanEnabled,
    intervalMinutes: settings.intervalMinutes,
    queries: settings.queries,
    nextAt: nextAtMs ? new Date(nextAtMs).toISOString() : null,
    lastScanAt: settings.lastScanAt,
    lastAdded: settings.lastAdded,
    unreadNewCount: settings.unreadNewCount,
    busy: isScanBusy() || isApplicationsBusy(),
  };
}
