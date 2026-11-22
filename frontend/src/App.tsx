import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkApplications,
  fetchAuthStatus,
  fetchVacancies,
  loginSource,
  runScan,
  updateVacancy,
  type CheckApplicationsResult,
  type ScanResult,
  type Vacancy,
  type VacancySource,
  type VacancyStatus,
} from './api';
import Toolbar from './components/Toolbar';
import VacancyList from './components/VacancyList';

const DEFAULT_QUERIES = 'frontend, fullstack, react, angular, vue';

export default function App() {
  const queryClient = useQueryClient();
  const [queries, setQueries] = useState(DEFAULT_QUERIES);
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [scanInfo, setScanInfo] = useState<ScanResult | null>(null);
  const [checkInfo, setCheckInfo] = useState<CheckApplicationsResult | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);

  const listParams = {
    source: source || undefined,
    status: status || undefined,
    q: search || undefined,
  };

  const vacanciesQuery = useQuery({
    queryKey: ['vacancies', listParams],
    queryFn: () => fetchVacancies(listParams),
  });

  const authQuery = useQuery({
    queryKey: ['auth-status'],
    queryFn: fetchAuthStatus,
  });

  const scanMutation = useMutation({
    mutationFn: (queryList: string[]) => runScan(queryList),
    onSuccess: async (result) => {
      setScanInfo(result);
      await queryClient.invalidateQueries({ queryKey: ['vacancies'] });
    },
  });

  const loginMutation = useMutation({
    mutationFn: (s: VacancySource) => loginSource(s),
    onSuccess: async (result) => {
      setLoginMessage(result.message);
      await queryClient.invalidateQueries({ queryKey: ['auth-status'] });
    },
  });

  const checkMutation = useMutation({
    mutationFn: () =>
      checkApplications({
        source: source ? (source as VacancySource) : undefined,
        limit: 30,
      }),
    onSuccess: async (result) => {
      setCheckInfo(result);
      await queryClient.invalidateQueries({ queryKey: ['vacancies'] });
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
        // Скрыли из активного списка — сразу убираем строку
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

  const errorMessage =
    (vacanciesQuery.error instanceof Error && vacanciesQuery.error.message) ||
    (scanMutation.error instanceof Error && scanMutation.error.message) ||
    (patchMutation.error instanceof Error && patchMutation.error.message) ||
    (loginMutation.error instanceof Error && loginMutation.error.message) ||
    (checkMutation.error instanceof Error && checkMutation.error.message) ||
    null;

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
          setScanInfo(null);
          const queryList = queries.split(',').map((q) => q.trim()).filter(Boolean);
          scanMutation.mutate(queryList);
        }}
        onLogin={(s) => {
          setLoginMessage(null);
          loginMutation.mutate(s);
        }}
        onCheckApplications={() => {
          setCheckInfo(null);
          checkMutation.mutate();
        }}
      />

      <Stack spacing={1} sx={{ mb: 1.5 }}>
        {loginMessage && (
          <Alert severity="success" sx={{ py: 0.25 }}>
            {loginMessage}
          </Alert>
        )}

        {loginMutation.isPending && (
          <Alert severity="info" sx={{ py: 0.25 }}>
            Открылось окно Chrome — войди на сайте. После входа нажми «Проверить отклики».
          </Alert>
        )}

        {checkMutation.isPending && (
          <Alert severity="info" sx={{ py: 0.25 }}>
            Проверка откликов в Chrome…
          </Alert>
        )}

        {scanInfo && (
          <Alert severity={scanInfo.errors.length ? 'warning' : 'success'} sx={{ py: 0.25 }}>
            Скан: +{scanInfo.added} новых, {scanInfo.updated} обновлено
            {scanInfo.errors.length ? `, ошибок: ${scanInfo.errors.length}` : ''}
          </Alert>
        )}

        {scanInfo && scanInfo.errors.length > 0 && (
          <Alert severity="warning" sx={{ py: 0.25 }}>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {scanInfo.errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </Box>
          </Alert>
        )}

        {checkInfo && (
          <Alert severity={checkInfo.errors.length ? 'warning' : 'success'} sx={{ py: 0.25 }}>
            Проверка откликов: проверено {checkInfo.checked}, откликов {checkInfo.applied},
            пропущено {checkInfo.skipped}
          </Alert>
        )}

        {checkInfo && checkInfo.errors.length > 0 && (
          <Alert severity="warning" sx={{ py: 0.25 }}>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {checkInfo.errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </Box>
          </Alert>
        )}

        {errorMessage && (
          <Alert severity="error" sx={{ py: 0.25 }}>
            {errorMessage}
          </Alert>
        )}
      </Stack>

      {vacanciesQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <VacancyList
          items={vacanciesQuery.data ?? []}
          onHide={(id) => patchMutation.mutate({ id, patch: { status: 'hidden' } })}
          onUnhide={(id) => patchMutation.mutate({ id, patch: { status: 'new' } })}
          onOpened={(id) => patchMutation.mutate({ id, patch: { opened: true } })}
        />
      )}
    </Container>
  );
}
