# Job Inbox

Локальный inbox удалённых вакансий с Habr Career, hh.ru, getmatch и Зарплаты.ру.

Архитектура и решения «что не тащим» — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).  
Заготовка Postgres — [docs/postgres.md](docs/postgres.md).

## Структура

```text
job-inbox/
  frontend/   # Vite + React + MUI + TanStack Query
  backend/    # Express + адаптеры + Playwright
  docs/
  docker-compose.yml  # опциональный Postgres (этап C)
```

## Запуск

```bash
cd job-inbox
npm install
docker compose up -d
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run prisma:migrate -w @job-inbox/backend
npm run playwright:install -w @job-inbox/backend
npm run dev
```

С рабочего стола: ярлык **Job Inbox** → `scripts/start-tray.vbs` (Docker + `npm run dev` в фоне, иконка в трее, браузер на http://localhost:5173).  
Меню трея: **Открыть UI** / **Стоп и выход**. Консольный запасной вариант: `scripts/start-desktop.bat` (тоже зовёт трей).

Опционально перенести старый JSON: `npm run db:import-json -w @job-inbox/backend`

- UI: http://localhost:5173
- API: http://localhost:3001

**Обновить** запускает скан в фоне (прогресс в UI) и пишет результат в Postgres.

## Проверка откликов (Playwright)

Проверка откликов: hh.ru, Habr Career, getmatch и Зарплата.ру.

1. Установи Chromium: `npm run playwright:install -w @job-inbox/backend`
2. В UI нажми чип источника — откроется Chrome, залогинься вручную. Сессия сохранится в `backend/.auth/{source}`.
3. Нажми **Проверить отклики** — проверка идёт в фоне с прогрессом; при признаке отклика ставится статус `applied`.
4. hh и Зарплата.ру — один контур HeadHunter: статус `applied` синхронизируется у зеркал с тем же id.

Автоотклик не делается — только чтение страницы.

## Стек

| Часть | Технологии |
|---|---|
| Frontend | React, Vite, MUI, TanStack Query |
| Backend | Express, TypeScript, Prisma, Playwright |
| DB | Postgres 16 (Docker Compose) |

## Источники

| Источник | Как собираем |
|---|---|
| Habr Career | specialty frontend/fullstack + remote + title; страницы до конца выдачи |
| hh.ru | text + `professional_role=96` + remote + title; страницы до конца (лимит HH API ~2000); при 403 — RSS |
| getmatch | `/api/offers` (js_frontend / fullstack + remote) + title; страницы до конца |
| Зарплата.ру | `/shards/vacancy/search` (remote + role 96 + title) до конца; при сбое — RSS; `applied` зеркалится с hh |

## Lint / format

Как в industrial-telemetry: Prettier + lint, Husky pre-commit через lint-staged.

```bash
npm run format          # prettier write (backend + frontend)
npm run lint            # проверка без правок
npm run lint:fix       # eslint/oxlint --fix
```

Перед коммитом husky прогоняет lint-staged по staged-файлам в `backend/` и `frontend/`.

## Production

```bash
npm run build
npm run start          # только API на :3001
npm run preview -w @job-inbox/frontend   # UI отдельно
```
