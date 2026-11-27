import type { Vacancy as PrismaVacancy } from '@prisma/client';
import { prisma } from './prisma.js';
import {
  hhFamilyTwin,
  type NormalizedVacancy,
  type VacancyRow,
  type VacancyStatus,
} from './types.js';

export interface ListFilters {
  status?: string;
  source?: string;
  q?: string;
}

export interface VacancyPatch {
  status?: VacancyStatus;
  opened?: boolean;
}

function toRow(row: PrismaVacancy): VacancyRow {
  return {
    id: row.id,
    source: row.source as VacancyRow['source'],
    external_id: row.externalId,
    title: row.title,
    company: row.company,
    url: row.url,
    salary: row.salary,
    published_at: row.publishedAt ? row.publishedAt.toISOString() : null,
    status: row.status as VacancyStatus,
    opened: row.opened,
    created_at: row.createdAt.toISOString(),
  };
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function upsertVacancies(
  items: NormalizedVacancy[],
): Promise<{ added: number; updated: number }> {
  let added = 0;
  let updated = 0;

  for (const item of items) {
    const existing = await prisma.vacancy.findUnique({
      where: {
        source_externalId: { source: item.source, externalId: item.externalId },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.vacancy.update({
        where: { id: existing.id },
        data: {
          title: item.title,
          company: item.company,
          url: item.url,
          salary: item.salary,
          publishedAt: parseDate(item.publishedAt),
        },
      });
      updated += 1;
    } else {
      await prisma.vacancy.create({
        data: {
          source: item.source,
          externalId: item.externalId,
          title: item.title,
          company: item.company,
          url: item.url,
          salary: item.salary,
          publishedAt: parseDate(item.publishedAt),
          status: 'new',
          opened: false,
        },
      });
      added += 1;
    }
  }

  return { added, updated };
}

export async function listVacancies(filters: ListFilters = {}): Promise<VacancyRow[]> {
  const q = filters.q?.trim();

  const rows = await prisma.vacancy.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : { status: { not: 'hidden' } }),
      ...(filters.source ? { source: filters.source } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { company: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
  });

  return rows.map(toRow);
}

export async function updateVacancy(id: number, patch: VacancyPatch): Promise<VacancyRow | null> {
  const existing = await prisma.vacancy.findUnique({ where: { id } });
  if (!existing) return null;

  const row = await prisma.vacancy.update({
    where: { id },
    data: {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.opened !== undefined ? { opened: patch.opened } : {}),
    },
  });

  return toRow(row);
}

/**
 * Обновляет статус и зеркало hh↔zarplata с тем же externalId.
 * Карточки не склеиваем — только статус отклика.
 */
export async function updateVacancyWithHhFamilyMirror(
  id: number,
  patch: VacancyPatch,
): Promise<VacancyRow | null> {
  const row = await updateVacancy(id, patch);
  if (!row || patch.status === undefined) return row;

  const twinSource = hhFamilyTwin(row.source);
  if (!twinSource) return row;

  const twin = await prisma.vacancy.findUnique({
    where: {
      source_externalId: { source: twinSource, externalId: row.external_id },
    },
    select: { id: true },
  });
  if (!twin) return row;

  await updateVacancy(twin.id, {
    status: patch.status,
    ...(patch.opened !== undefined ? { opened: patch.opened } : {}),
  });

  return row;
}

/** Удаляет нерелевантные; hidden не трогаем. */
export async function pruneIrrelevantVacancies(
  keep: (row: VacancyRow) => boolean,
): Promise<number> {
  const rows = await prisma.vacancy.findMany({
    where: { status: { not: 'hidden' } },
  });

  const toDelete = rows.map(toRow).filter((row) => !keep(row));
  if (toDelete.length === 0) return 0;

  await prisma.vacancy.deleteMany({
    where: { id: { in: toDelete.map((r) => r.id) } },
  });

  return toDelete.length;
}
