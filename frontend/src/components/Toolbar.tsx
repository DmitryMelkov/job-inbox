import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import type { AuthStatus, VacancySource } from '../api';

interface ToolbarProps {
  queries: string;
  source: string;
  status: string;
  search: string;
  scanning: boolean;
  checking: boolean;
  loggingIn: VacancySource | null;
  authStatus?: AuthStatus;
  onQueriesChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onScan: () => void;
  onLogin: (source: VacancySource) => void;
  onCheckApplications: () => void;
}

const LOGIN_SOURCES: VacancySource[] = ['hh', 'habr', 'getmatch'];

export default function Toolbar({
  queries,
  source,
  status,
  search,
  scanning,
  checking,
  loggingIn,
  authStatus,
  onQueriesChange,
  onSourceChange,
  onStatusChange,
  onSearchChange,
  onScan,
  onLogin,
  onCheckApplications,
}: ToolbarProps) {
  const busy = scanning || checking || Boolean(loggingIn);

  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 1, mb: 1.5 }}>
      <Stack spacing={1}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
            {LOGIN_SOURCES.map((s) => {
              const ready = Boolean(authStatus?.[s]);
              const isLogging = loggingIn === s;
              return (
                <Tooltip
                  key={s}
                  title={
                    ready
                      ? `Сессия ${s} сохранена. Клик — войти снова`
                      : `Войти в ${s} (откроется Chrome)`
                  }
                >
                  <Chip
                    size="small"
                    label={isLogging ? `${s}…` : s}
                    color={ready ? 'success' : 'default'}
                    variant={ready ? 'filled' : 'outlined'}
                    disabled={busy}
                    onClick={() => onLogin(s)}
                    icon={
                      isLogging ? <CircularProgress size={12} color="inherit" /> : undefined
                    }
                    sx={{ height: 26, fontWeight: 500 }}
                  />
                </Tooltip>
              );
            })}
          </Stack>

          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            <Button
              size="small"
              variant="contained"
              onClick={onScan}
              disabled={busy}
              startIcon={scanning ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {scanning ? 'Обновляю…' : 'Обновить'}
            </Button>
            <Button
              size="small"
              variant="contained"
              color="secondary"
              onClick={onCheckApplications}
              disabled={busy}
              startIcon={checking ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {checking ? 'Проверяю…' : 'Проверить отклики'}
            </Button>
          </Stack>
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <TextField
            size="small"
            value={queries}
            onChange={(e) => onQueriesChange(e.target.value)}
            placeholder="frontend, fullstack, react, angular, vue"
            fullWidth
            sx={{ flex: 2, minWidth: 180 }}
          />

          <FormControl size="small" sx={{ minWidth: 120, flex: 0.7 }}>
            <InputLabel id="source-label">Источник</InputLabel>
            <Select
              labelId="source-label"
              label="Источник"
              value={source}
              onChange={(e) => onSourceChange(e.target.value)}
            >
              <MenuItem value="">Все</MenuItem>
              <MenuItem value="habr">habr</MenuItem>
              <MenuItem value="hh">hh</MenuItem>
              <MenuItem value="getmatch">getmatch</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 130, flex: 0.7 }}>
            <InputLabel id="status-label">Показ</InputLabel>
            <Select
              labelId="status-label"
              label="Показ"
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              <MenuItem value="">Активные</MenuItem>
              <MenuItem value="new">Новые</MenuItem>
              <MenuItem value="applied">Отклики</MenuItem>
              <MenuItem value="hidden">Скрытые</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Поиск…"
            sx={{ minWidth: 140, flex: 1 }}
          />
        </Stack>
      </Stack>
    </Paper>
  );
}
