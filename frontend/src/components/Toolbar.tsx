import { useMemo, useState } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
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
  autoScanEnabled: boolean;
  nextScanLabel: string | null;
  onQueriesChange: (value: string) => void;
  onAutoScanChange: (enabled: boolean) => void;
  onSourceChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onScan: () => void;
  onLogin: (source: VacancySource) => void;
  onCheckApplications: () => void;
}

const LOGIN_SOURCES: VacancySource[] = ['hh', 'habr', 'getmatch'];

/** Пресеты для скана (кнопка «Обновить»). */
const SCAN_PRESETS = ['frontend', 'fullstack', 'react', 'angular', 'vue'] as const;

/** Компактные поля фильтра списка. */
const compactFieldSx = {
  '& .MuiInputBase-root': {
    height: 30,
    fontSize: 13,
    borderRadius: 1.5,
  },
  '& .MuiInputBase-input': {
    py: 0.5,
    fontSize: 13,
  },
  '& .MuiInputLabel-root': {
    fontSize: 13,
  },
  '& .MuiInputLabel-root:not(.MuiInputLabel-shrink)': {
    transform: 'translate(14px, 6px) scale(1)',
  },
  '& .MuiSelect-select': {
    py: 0.5,
    display: 'flex',
    alignItems: 'center',
  },
} as const;

function parseQueryTokens(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function isScanPreset(token: string): token is (typeof SCAN_PRESETS)[number] {
  return (SCAN_PRESETS as readonly string[]).includes(token);
}

function serializeQueries(presetsOn: Set<string>, extra: string): string {
  const extras = parseQueryTokens(extra).filter((token) => !isScanPreset(token));
  return [...SCAN_PRESETS.filter((p) => presetsOn.has(p)), ...extras].join(', ');
}

export default function Toolbar({
  queries,
  source,
  status,
  search,
  scanning,
  checking,
  loggingIn,
  authStatus,
  autoScanEnabled,
  nextScanLabel,
  onQueriesChange,
  onAutoScanChange,
  onSourceChange,
  onStatusChange,
  onSearchChange,
  onScan,
  onLogin,
  onCheckApplications,
}: ToolbarProps) {
  const busy = scanning || checking || Boolean(loggingIn);
  const [queriesAnchor, setQueriesAnchor] = useState<HTMLElement | null>(null);

  const tokens = useMemo(() => parseQueryTokens(queries), [queries]);
  const selectedPresets = useMemo(
    () => new Set<string>(SCAN_PRESETS.filter((p) => tokens.includes(p))),
    [tokens],
  );
  const extraQueries = useMemo(
    () => tokens.filter((token) => !isScanPreset(token)).join(', '),
    [tokens],
  );
  const selectedCount = tokens.length;

  const togglePreset = (preset: (typeof SCAN_PRESETS)[number]) => {
    const next = new Set(selectedPresets);
    if (next.has(preset)) {
      next.delete(preset);
    } else {
      next.add(preset);
    }
    onQueriesChange(serializeQueries(next, extraQueries));
  };

  return (
    <Paper variant="outlined" sx={{ px: 1.25, pt: 0.75, pb: 1, mb: 1.5, overflow: 'visible' }}>
      {/* spacing ≥ 1.5: у outlined Select floating-label уходит вверх и иначе наезжает на кнопки */}
      <Stack spacing={1.5}>
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
                    icon={isLogging ? <CircularProgress size={12} color="inherit" /> : undefined}
                    sx={{ height: 24, fontWeight: 500, fontSize: 12 }}
                  />
                </Tooltip>
              );
            })}
          </Stack>

          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
            <Tooltip title="Что качать с hh / habr / getmatch при «Обновить»">
              <Button
                size="small"
                variant="outlined"
                startIcon={<TuneIcon sx={{ fontSize: 16 }} />}
                disabled={busy}
                onClick={(e) => setQueriesAnchor(e.currentTarget)}
                sx={{ py: 0.25, px: 1, fontSize: 13, minHeight: 30 }}
              >
                Запросы{selectedCount ? ` (${selectedCount})` : ''}
              </Button>
            </Tooltip>
            <Tooltip title="Автоскан на бэкенде каждые 10 мин (даже если UI закрыт)">
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={autoScanEnabled}
                    onChange={(e) => onAutoScanChange(e.target.checked)}
                    disabled={busy}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    Авто
                    {autoScanEnabled && nextScanLabel ? (
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 0.5 }}
                      >
                        {nextScanLabel}
                      </Typography>
                    ) : null}
                  </Typography>
                }
                sx={{ ml: 0.25, mr: 0.5, gap: 0.25 }}
              />
            </Tooltip>
            <Button
              size="small"
              variant="contained"
              onClick={onScan}
              disabled={busy || selectedCount === 0}
              startIcon={scanning ? <CircularProgress size={14} color="inherit" /> : undefined}
              sx={{ py: 0.25, px: 1.25, fontSize: 13, minHeight: 30 }}
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
              sx={{ py: 0.25, px: 1.25, fontSize: 13, minHeight: 30 }}
            >
              {checking ? 'Проверяю…' : 'Проверить отклики'}
            </Button>
          </Stack>
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={0.75}
          alignItems={{ md: 'center' }}
          sx={{ pt: 0.5 }}
        >
          <TextField
            size="small"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Фильтр списка (название, компания…)"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{ ...compactFieldSx, flex: 2, minWidth: 180 }}
          />

          <FormControl size="small" sx={{ ...compactFieldSx, minWidth: 110, flex: 0.55 }}>
            <InputLabel id="source-label">Источник</InputLabel>
            <Select
              labelId="source-label"
              label="Источник"
              value={source}
              onChange={(e) => onSourceChange(e.target.value)}
            >
              <MenuItem value="" dense>
                Все
              </MenuItem>
              <MenuItem value="habr" dense>
                habr
              </MenuItem>
              <MenuItem value="hh" dense>
                hh
              </MenuItem>
              <MenuItem value="getmatch" dense>
                getmatch
              </MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ ...compactFieldSx, minWidth: 120, flex: 0.6 }}>
            <InputLabel id="status-label">Показ</InputLabel>
            <Select
              labelId="status-label"
              label="Показ"
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              <MenuItem value="" dense>
                Активные
              </MenuItem>
              <MenuItem value="new" dense>
                Новые
              </MenuItem>
              <MenuItem value="applied" dense>
                Отклики
              </MenuItem>
              <MenuItem value="hidden" dense>
                Скрытые
              </MenuItem>
              <MenuItem value="dropped" dense>
                Отрезанные
              </MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      <Popover
        open={Boolean(queriesAnchor)}
        anchorEl={queriesAnchor}
        onClose={() => setQueriesAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, width: 280 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.25 }}>
            Запросы для скана
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Что качать с сайтов при «Обновить». Не путать с поиском по уже скачанному списку.
          </Typography>
          <FormGroup>
            {SCAN_PRESETS.map((preset) => (
              <FormControlLabel
                key={preset}
                control={
                  <Checkbox
                    size="small"
                    checked={selectedPresets.has(preset)}
                    onChange={() => togglePreset(preset)}
                  />
                }
                label={<Typography variant="body2">{preset}</Typography>}
                sx={{ mr: 0 }}
              />
            ))}
          </FormGroup>
          <Divider sx={{ my: 1 }} />
          <TextField
            size="small"
            fullWidth
            label="Ещё слова"
            placeholder="next, typescript…"
            value={extraQueries}
            onChange={(e) => onQueriesChange(serializeQueries(selectedPresets, e.target.value))}
            helperText="Через запятую, сверх галочек"
          />
        </Box>
      </Popover>
    </Paper>
  );
}
