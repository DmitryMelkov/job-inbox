# Архитектура Job Inbox

Личный local-first inbox. Один пользователь, данные на машине.

## Хранилище

- **Postgres** + **Prisma** (`backend/prisma/schema.prisma`)
- Сессии Playwright: `backend/.auth/{source}`
- Старый JSON (`backend/data/vacancies.json`) можно один раз импортировать: `npm run db:import-json -w @job-inbox/backend`

**Намеренно не используем** Kafka, Redis, Tarantool, Mongo.

## Источники

Адаптеры в `backend/src/adapters/` реализуют `VacancyAdapter` и регистрируются в `scan.ts`.

- **Скан:** habr, hh, getmatch, zarplata
- **Проверка откликов (Playwright):** только `ApplicationSource` — hh, habr, getmatch
- **hh ↔ Зарплата.ру:** каталог пересекается (часто один `externalId`), но карточки храним отдельно по `(source, externalId)`

## Фоновые задачи

Скан и проверка откликов — in-process jobs с прогрессом (`GET /api/jobs/:id`), без внешней очереди.
