import { useState } from 'react';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { Vacancy } from '../api';

interface VacancyListProps {
  items: Vacancy[];
  onHide: (id: number) => void;
  onUnhide: (id: number) => void;
  onOpened: (id: number) => void;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ru-RU');
}

export default function VacancyList({ items, onHide, onUnhide, onOpened }: VacancyListProps) {
  const [pendingHide, setPendingHide] = useState<Vacancy | null>(null);

  if (items.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }} variant="outlined">
        <Typography color="text.secondary">
          Пока пусто. Нажми «Обновить», чтобы собрать вакансии.
        </Typography>
      </Paper>
    );
  }

  return (
    <>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ py: 0.75 }}>Вакансия</TableCell>
              <TableCell sx={{ py: 0.75 }}>Зарплата</TableCell>
              <TableCell sx={{ py: 0.75, width: 100 }}>Источник</TableCell>
              <TableCell sx={{ py: 0.75, width: 100 }}>Дата</TableCell>
              <TableCell sx={{ py: 0.75, width: 56 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => {
              const opened = Boolean(item.opened);
              const hidden = item.status === 'hidden';

              const markOpened = () => {
                if (!opened) onOpened(item.id);
              };

              return (
                <TableRow
                  key={item.id}
                  hover
                  sx={{
                    opacity: opened || hidden ? 0.55 : 1,
                    bgcolor: opened ? 'action.hover' : 'transparent',
                    transition: 'opacity 0.15s ease, background-color 0.15s ease',
                  }}
                >
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Link
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        underline="hover"
                        fontWeight={600}
                        color={opened ? 'text.secondary' : 'primary'}
                        onMouseDown={(e) => {
                          if (e.button === 0 || e.button === 1 || e.button === 2) markOpened();
                        }}
                        onAuxClick={(e) => {
                          if (e.button === 1) markOpened();
                        }}
                        onContextMenu={() => {
                          markOpened();
                        }}
                      >
                        {item.title}
                      </Link>
                      {item.status === 'applied' && (
                        <Chip label="отклик" size="small" color="success" variant="outlined" />
                      )}
                      {item.status === 'new' && !opened && (
                        <Chip label="новая" size="small" variant="outlined" />
                      )}
                      {opened && <Chip label="открыто" size="small" variant="outlined" />}
                      {hidden && <Chip label="скрыта" size="small" color="default" />}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {item.company}
                    </Typography>
                  </TableCell>
                  <TableCell>{item.salary || '—'}</TableCell>
                  <TableCell>
                    <Chip label={item.source} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell>{formatDate(item.published_at || item.created_at)}</TableCell>
                  <TableCell align="right">
                    {hidden ? (
                      <Tooltip title="Вернуть в список">
                        <IconButton
                          size="small"
                          aria-label="Вернуть"
                          onClick={() => onUnhide(item.id)}
                        >
                          <VisibilityOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Убрать из списка">
                        <IconButton
                          size="small"
                          aria-label="Скрыть"
                          onClick={() => setPendingHide(item)}
                        >
                          <VisibilityOffOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={Boolean(pendingHide)}
        onClose={() => setPendingHide(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Убрать из списка?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingHide
              ? `«${pendingHide.title}» исчезнет из активного списка. Потом можно вернуть через фильтр «Скрытые».`
              : null}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingHide(null)}>Отмена</Button>
          <Button
            color="primary"
            variant="contained"
            onClick={() => {
              if (pendingHide) onHide(pendingHide.id);
              setPendingHide(null);
            }}
          >
            Убрать
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
