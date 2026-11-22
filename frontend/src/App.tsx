import { useCallback, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import LinearProgress from '@mui/material/LinearProgress';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAuthStatus,
  fetchDroppedVacancies,
  fetchVacancies,
  loginSource,
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

export default function App() {
  const queryClient = useQueryClient();
  const [queries, setQueries] = useState(DEFAULT_QUERIES);
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [jobProgress, setJobProgress] = useState<JobRecord | null>(null);
  const [snack, setSnack] = useState<SnackState | null>(null);

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

  const showSnack = useCallback((severity: SnackState['severity'], message: string) => {
    setSnack({ severity, message });
  }, []);

  const scanMutation = useMutation({
    mutationFn: async (queryList: string[]) => {
      setJobProgress(null);
      const job = await waitForJob(() => runScan(queryList), setJobProgress);
      return job;
    },
    onSuccess: async (job) => {
      setJobProgress(null);
      await queryClient.invalidateQueries({ queryKey: ['vacancies'] });
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
      const previous = queryClient.getQueriesData<Vacancy[]>({ queryKey: ['vacancies'] });
      queryClient.setQueriesData<Vacancy[]>({ queryKey: ['vacancies'] }, (old) => {
        if (!old) return old;
        if (patch.status === 'hidden' && !listParams.status) {
          return old.filter((item) => item.id !== id);
        }
        return old.map((item) => (item.id === id ? { ...item, ...patch } : item));
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
      queryClient.setQueriesData<Vacancy[]>({ queryKey: ['vacancies'] }, (old) => {
        if (!old) return old;
        return old.map((item) => (item.id === updated.id ? updated : item));
      });
    },
  });

  const progressPct =
    jobProgress && jobProgress.progress.total > 0
      ? Math.min(100, Math.round((jobProgress.progress.current / jobProgress.progress.total) * 100))
      : jobProgress
        ? 10
        : 0;

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
        onQueriesChange={setQueries}
        onSourceChange={setSource}
        onStatusChange={setStatus}
        onSearchChange={setSearch}
        onScan={() => {
          const queryList = queries
            .split(',')
            .map((q) => q.trim())
            .filter(Boolean);
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
