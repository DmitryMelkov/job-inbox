import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import LinearProgress from '@mui/material/LinearProgress';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ackAutoscan,
  fetchAuthStatus,
  fetchAutoscan,
  fetchDroppedVacancies,
  fetchSettings,
  fetchVacancies,
  loginSource,
  patchSettings,
  runScan,
  startCheckApplications,
  updateVacancy,
  waitForJob,
  type CheckApplicationsResult,
  type JobRecord,
  type ScanResult,
  type Vacancy,
  type VacancySource,
  type VacancyStatus,
} from './api';
import Toolbar from './components/Toolbar';
import VacancyList from './components/VacancyList';

const DEFAULT_QUERIES = 'frontend, fullstack, react, angular, vue';

interface SnackState {
  severity: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

function queriesToList(raw: string): string[] {
  return raw
    .split(',')
    .map((q) => q.trim())
    .filter(Boolean);
}

export default function App() {
  const queryClient = useQueryClient();
  const [queries, setQueries] = useState(DEFAULT_QUERIES);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [settingsReady, setSettingsReady] = useState(false);
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [jobProgress, setJobProgress] = useState<JobRecord | null>(null);
  const [snack, setSnack] = useState<SnackState | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const droppedMode = status === 'dropped';
  const listParams = {
    source: source || undefined,
    status: droppedMode ? undefined : status || undefined,
    q: search || undefined,
  };

  const vacanciesQuery = useQuery({
    queryKey: ['vacancies', droppedMode ? 'dropped' : 'list', listParams],
    queryFn: async () => {
      if (droppedMode) {
        const data = await fetchDroppedVacancies({
          source: listParams.source,
          q: listParams.q,
        });
        return data;
      }
      const items = await fetchVacancies(listParams);
      return { items, updatedAt: null as string | null };
    },
  });

  const authQuery = useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
  });

  const autoscanQuery = useQuery({
    queryKey: ['autoscan'],
    queryFn: fetchAutoscan,
    refetchInterval: 15_000,
    enabled: settingsReady,
  });

  // Локальные часы: React Query не ре-рендерит, пока nextAt с API не изменился.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!autoScanEnabled) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [autoScanEnabled]);

  useEffect(() => {
    const nextAt = autoscanQuery.data?.nextAt;
    if (!nextAt || !autoScanEnabled) return;
    if (new Date(nextAt).getTime() <= nowMs) {
      void queryClient.invalidateQueries({ queryKey: ['autoscan'] });
      void queryClient.invalidateQueries({ queryKey: ['vacancies'] });
    }
  }, [nowMs, autoscanQuery.data?.nextAt, autoScanEnabled, queryClient]);

  const showSnack = useCallback((severity: SnackState['severity'], message: string) => {
    setSnack({ severity, message });
  }, []);

  const lastSeenScanAtRef = useRef<string | null>(null);
  const manualScanPendingRef = useRef(false);
  useEffect(() => {
    const snap = autoscanQuery.data;
    if (!snap?.lastScanAt) return;
    if (lastSeenScanAtRef.current === null) {
      lastSeenScanAtRef.current = snap.lastScanAt;
      return;
    }
    if (snap.lastScanAt === lastSeenScanAtRef.current) return;
    lastSeenScanAtRef.current = snap.lastScanAt;
    // Ручной скан уже показывает свой snack — здесь только фоновый автоскан.
    if (manualScanPendingRef.current) return;
    const added = snap.lastAdded ?? 0;
    if (added > 0) {
      showSnack('success', `Автоскан: +${added} новых`);
      void queryClient.invalidateQueries({ queryKey: ['vacancies'] });
    } else {
      showSnack('info', 'Автоскан: новых вакансий нет');
    }
  }, [autoscanQuery.data?.lastScanAt, autoscanQuery.data?.lastAdded, showSnack, queryClient]);

  const ackAndRefresh = useCallback(async () => {
    try {
      await ackAutoscan();
      await queryClient.invalidateQueries({ queryKey: ['vacancies'] });
      await queryClient.invalidateQueries({ queryKey: ['autoscan'] });
    } catch {
      // API ещё не поднялся — тихо.
    }
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchSettings();
        if (cancelled) return;
        if (settings.queries.length) {
          setQueries(settings.queries.join(', '));
        }
        setAutoScanEnabled(settings.autoScanEnabled);
      } catch {
        // оставим дефолты
      } finally {
        if (!cancelled) {
          setSettingsReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    void ackAndRefresh();
    const onFocus = () => {
      void ackAndRefresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [settingsReady, ackAndRefresh]);

  // Синхронизация тогла Авто с треем / другими вкладками.
  useEffect(() => {
    if (autoscanQuery.data && typeof autoscanQuery.data.enabled === 'boolean') {
      setAutoScanEnabled(autoscanQuery.data.enabled);
    }
  }, [autoscanQuery.data?.enabled]);

  const handleQueriesChange = useCallback(
    (value: string) => {
      setQueries(value);
      if (persistTimer.current) {
        clearTimeout(persistTimer.current);
      }
      persistTimer.current = setTimeout(() => {
        const list = queriesToList(value);
        void patchSettings({ queries: list }).then(() => {
          void queryClient.invalidateQueries({ queryKey: ['autoscan'] });
        });
      }, 400);
    },
    [queryClient],
  );

  const handleAutoScanChange = useCallback(
    (enabled: boolean) => {
      setAutoScanEnabled(enabled);
      void patchSettings({ autoScanEnabled: enabled })
        .then(() => queryClient.invalidateQueries({ queryKey: ['autoscan'] }))
        .catch((err) => {
          showSnack('error', err instanceof Error ? err.message : String(err));
        });
    },
    [queryClient, showSnack],
  );

  const scanMutation = useMutation({
    mutationFn: async (queryList: string[]) => {
      manualScanPendingRef.current = true;
      setJobProgress(null);
      const job = await waitForJob(() => runScan(queryList), setJobProgress);
      return job;
    },
    onSuccess: async (job) => {
      manualScanPendingRef.current = false;
      setJobProgress(null);
      await queryClient.invalidateQueries({ queryKey: ['vacancies'] });
      await queryClient.invalidateQueries({ queryKey: ['autoscan'] });
      const result = job.result as ScanResult | undefined;
      if (!result) {
        showSnack('success', 'Скан завершён');
        return;
      }
      const titleStats = (result.sources ?? [])
        .map((s) => `${s.source} ${s.kept}/${s.seen} (−${s.dropped})`)
        .join(', ');
      const base = `Скан: +${result.added} новых, ${result.updated} обновлено${
        titleStats ? `. Title: ${titleStats}` : ''
      }`;
      if (result.errors.length) {
        showSnack('warning', `${base}. ${result.errors.slice(0, 2).join('; ')}`);
      } else {
        showSnack('success', base);
      }
    },
    onError: (err) => {
      manualScanPendingRef.current = false;
      setJobProgress(null);
      showSnack('error', err instanceof Error ? err.message : String(err));
    },
  });

  const loginMutation = useMutation({
    mutationFn: (s: VacancySource) => loginSource(s),
    onSuccess: async (result) => {
      showSnack('success', result.message);
      await queryClient.invalidateQueries({ queryKey: ['auth-status'] });
    },
    onError: (err) => {
      showSnack('error', err instanceof Error ? err.message : String(err));
    },
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      setJobProgress(null);
      return waitForJob(
        () =>
          startCheckApplications({
            source: source ? (source as VacancySource) : undefined,
            limit: 30,
          }),
        setJobProgress,
      );
    },
    onSuccess: async (job) => {
      setJobProgress(null);
      await queryClient.invalidateQueries({ queryKey: ['vacancies'] });
      const result = job.result as CheckApplicationsResult | undefined;
      if (!result) {
        showSnack('success', 'Проверка откликов завершена');
        return;
      }
      const base = `Отклики: проверено ${result.checked}, откликов ${result.applied}, пропущено ${result.skipped}`;
      if (result.errors.length) {
        showSnack('warning', `${base}. ${result.errors.slice(0, 2).join('; ')}`);
      } else {
        showSnack('success', base);
      }
    },
    onError: (err) => {
      setJobProgress(null);
      showSnack('error', err instanceof Error ? err.message : String(err));
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: { status?: VacancyStatus; opened?: boolean };
    }) => updateVacancy(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['vacancies'] });
      type VacancyPage = { items: Vacancy[]; updatedAt: string | null };
      const previous = queryClient.getQueriesData<VacancyPage>({ queryKey: ['vacancies'] });
      queryClient.setQueriesData<VacancyPage>({ queryKey: ['vacancies'] }, (old) => {
        if (!old || !Array.isArray(old.items)) return old;
        if (patch.status === 'hidden' && !listParams.status) {
          return { ...old, items: old.items.filter((item) => item.id !== id) };
        }
        return {
          ...old,
          items: old.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      showSnack('error', 'Не удалось обновить вакансию');
    },
    onSuccess: async (updated) => {
      if (updated.status === 'hidden' && !listParams.status) {
        await queryClient.invalidateQueries({ queryKey: ['vacancies'] });
        return;
      }
      if (updated.status === 'new' && listParams.status === 'hidden') {
        await queryClient.invalidateQueries({ queryKey: ['vacancies'] });
        return;
      }
      type VacancyPage = { items: Vacancy[]; updatedAt: string | null };
      queryClient.setQueriesData<VacancyPage>({ queryKey: ['vacancies'] }, (old) => {
        if (!old || !Array.isArray(old.items)) return old;
        return {
          ...old,
          items: old.items.map((item) => (item.id === updated.id ? updated : item)),
        };
      });
    },
  });

  const progressPct =
    jobProgress && jobProgress.progress.total > 0
      ? Math.min(100, Math.round((jobProgress.progress.current / jobProgress.progress.total) * 100))
      : jobProgress
        ? 10
        : 0;

  const nextScanLabel = (() => {
    const snap = autoscanQuery.data;
    if (!snap?.enabled || !snap.nextAt) return null;
    const ms = new Date(snap.nextAt).getTime() - nowMs;
    if (ms <= 0) return 'след. скан сейчас…';
    const mins = Math.max(1, Math.ceil(ms / 60_000));
    return `след. скан ~${mins}м`;
  })();

  return (
    <Container maxWidth="lg" sx={{ py: 1.5, px: { xs: 1.5, sm: 2 } }}>
      <Toolbar
        queries={queries}
        source={source}
        status={status}
        search={search}
        scanning={scanMutation.isPending}
        checking={checkMutation.isPending}
        loggingIn={loginMutation.isPending ? (loginMutation.variables ?? null) : null}
        authStatus={authQuery.data}
        autoScanEnabled={autoScanEnabled}
        nextScanLabel={nextScanLabel}
        onQueriesChange={handleQueriesChange}
        onAutoScanChange={handleAutoScanChange}
        onSourceChange={setSource}
        onStatusChange={setStatus}
        onSearchChange={setSearch}
        onScan={() => {
          const queryList = queriesToList(queries);
          scanMutation.mutate(queryList);
        }}
        onLogin={(s) => loginMutation.mutate(s)}
        onCheckApplications={() => checkMutation.mutate()}
      />

      {(scanMutation.isPending || checkMutation.isPending) && (
        <Box sx={{ mb: 1.5 }}>
          <LinearProgress
            variant={jobProgress?.progress.total ? 'determinate' : 'indeterminate'}
            value={progressPct}
            sx={{ borderRadius: 1, height: 6 }}
          />
          <Typography variant="caption" color="text.secondary">
            {jobProgress?.progress.message ||
              (scanMutation.isPending ? 'Скан…' : 'Проверка откликов…')}
            {jobProgress?.progress.total
              ? ` (${jobProgress.progress.current}/${jobProgress.progress.total})`
              : ''}
          </Typography>
        </Box>
      )}

      {loginMutation.isPending && (
        <Alert severity="info" sx={{ mb: 1.5, py: 0.25 }}>
          Открылось окно Chrome — войди на сайте. После входа нажми «Проверить отклики».
        </Alert>
      )}

      {droppedMode && (
        <Alert severity="warning" sx={{ mb: 1.5, py: 0.25 }}>
          Отрезанные title-фильтром на последнем скане
          {vacanciesQuery.data?.updatedAt
            ? ` (${new Date(vacanciesQuery.data.updatedAt).toLocaleString('ru-RU')})`
            : ''}
          . После рестарта API список пуст, пока снова не нажмёшь «Обновить».
        </Alert>
      )}

      {vacanciesQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <VacancyList
          items={vacanciesQuery.data?.items ?? []}
          readOnly={droppedMode}
          onHide={(id) => patchMutation.mutate({ id, patch: { status: 'hidden' } })}
          onUnhide={(id) => patchMutation.mutate({ id, patch: { status: 'new' } })}
          onOpened={(id) => patchMutation.mutate({ id, patch: { opened: true } })}
        />
      )}

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={6000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? (
          <Alert
            severity={snack.severity}
            onClose={() => setSnack(null)}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Container>
  );
}
