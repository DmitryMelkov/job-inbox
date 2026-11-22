/**
 * Одноразовый импорт backend/data/vacancies.json → Postgres.
 * npx tsx scripts/import-json.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { prisma } from '../src/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface JsonRow {
  source: string;
  external_id: string;
  title: string;
  company: string;
  url: string;
  salary: string | null;
  published_at: string | null;
  status: string;
  opened?: boolean;
  created_at?: string;
}

interface Store {
  vacancies?: JsonRow[];
}

async function main(): Promise<void> {
  const jsonPath = path.resolve(__dirname, '../data/vacancies.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('Нет файла', jsonPath);
    return;
  }

  const store = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Store;
  const rows = store.vacancies ?? [];
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.source || !row.external_id) {
      skipped += 1;
      continue;
    }
    const status = row.status === 'interesting' ? 'new' : row.status || 'new';
    const publishedAt = row.published_at ? new Date(row.published_at) : null;
    const createdAt = row.created_at ? new Date(row.created_at) : new Date();

    const existing = await prisma.vacancy.findUnique({
      where: {
        source_externalId: { source: row.source, externalId: row.external_id },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.vacancy.update({
        where: { id: existing.id },
        data: {
          title: row.title,
          company: row.company,
          url: row.url,
          salary: row.salary,
          publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
          status,
          opened: Boolean(row.opened),
        },
      });
      updated += 1;
    } else {
      await prisma.vacancy.create({
        data: {
          source: row.source,
          externalId: row.external_id,
          title: row.title,
          company: row.company,
          url: row.url,
          salary: row.salary,
          publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
          status,
          opened: Boolean(row.opened),
          createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : new Date(),
        },
      });
      added += 1;
    }
  }

  console.log(`Импорт: +${added} новых, ${updated} обновлено, пропущено ${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
