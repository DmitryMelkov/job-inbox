# Job Inbox

Локальный inbox удалённых вакансий: Habr Career, hh.ru, getmatch.

## Структура

```text
job-inbox/
  frontend/   # Vite + React + MUI + TanStack Query
  backend/    # Express + адаптеры + Playwright
```

## Запуск

```bash
cd job-inbox
npm install
npm run playwright:install -w @job-inbox/backend
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001

Кнопка **Обновить** запускает скан и пишет результат в `backend/data/vacancies.json`.

## Проверка откликов (Playwright)

1. Установи Chromium: `npm run playwright:install -w @job-inbox/backend`
2. В UI нажми **Войти hh** / **Войти habr** / **Войти getmatch** — откроется отдельное окно Chrome, залогинься вручную (капча/2FA тоже там). Когда вход определится, окно закроется, сессия сохранится в `backend/.auth/{source}`.
3. Нажми **Проверить отклики** — программа по очереди откроет вакансии (не `applied` / не `hidden`, до 30 шт., с учётом фильтра источника) и если на сайте видно, что ты уже откликался, поставит статус `applied`.

Автоотклик не делается — только чтение страницы.

## Стек

| Часть | Технологии |
|---|---|
| Frontend | React, Vite, MUI, TanStack Query |
| Backend | Express, TypeScript, JSON-хранилище, Playwright |

## Источники

| Источник | Как собираем |
|---|---|
| Habr Career | frontend JSON API, только remote |
| hh.ru | API; при 403 — RSS |
| getmatch | `/api/offers` (специализации + remote) |

## Production

```bash
npm run build
npm run start          # только API на :3001
npm run preview -w @job-inbox/frontend   # UI отдельно
```
