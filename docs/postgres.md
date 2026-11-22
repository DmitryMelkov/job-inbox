# Postgres + Prisma

## Поднять БД

```bash
docker compose up -d
cp backend/.env.example backend/.env   # если ещё нет
npm install
npm run prisma:migrate -w @job-inbox/backend
```

`DATABASE_URL` по умолчанию: `postgresql://jobinbox:jobinbox@localhost:5432/jobinbox`

## Импорт из JSON (один раз)

```bash
npm run db:import-json -w @job-inbox/backend
```

## Studio

```bash
npm run prisma:studio -w @job-inbox/backend
```
