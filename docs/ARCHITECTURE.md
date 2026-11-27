# Архитектура Job Inbox

Личный local-first inbox. Один пользователь, данные на машине.

## Хранилище

- **Postgres** + **Prisma** (`backend/prisma/schema.prisma`)
- Сессии Playwright: `backend/.auth/{source}`
- Старый JSON (`backend/data/vacancies.json`) можно один раз импортировать: `npm run db:import-json -w @job-inbox/backend`

**Намеренно не используем** Kafka, Redis, Tarantool, Mongo.

## Источники

Адаптеры в `backend/src/adapters/` реализуют `VacancyAdapter` и регистрируются в `scan.ts`.

- **Скан + проверка откликов:** habr, hh, getmatch, zarplata (сессии в `backend/.auth/{source}`)
- **hh ↔ Зарплата.ру:** часто один `externalId`; карточки раздельные, статус `applied` зеркалится

## Фоновые задачи

Скан и проверка откликов — in-process jobs с прогрессом (`GET /api/jobs/:id`), без внешней очереди.
