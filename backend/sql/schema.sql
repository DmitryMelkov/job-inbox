-- Заготовка схемы для перехода с JSON (приложение пока JSON не использует).

CREATE TABLE IF NOT EXISTS vacancies (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL CHECK (source IN ('habr', 'hh', 'getmatch')),
  external_id     TEXT NOT NULL,
  title           TEXT NOT NULL,
  company         TEXT NOT NULL,
  url             TEXT NOT NULL,
  salary          TEXT,
  published_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'applied', 'hidden')),
  opened          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies (status);
CREATE INDEX IF NOT EXISTS idx_vacancies_source ON vacancies (source);
CREATE INDEX IF NOT EXISTS idx_vacancies_published_at ON vacancies (published_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS scan_runs (
  id           BIGSERIAL PRIMARY KEY,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  queries      TEXT[] NOT NULL DEFAULT '{}',
  added        INT NOT NULL DEFAULT 0,
  updated      INT NOT NULL DEFAULT 0,
  errors       TEXT[] NOT NULL DEFAULT '{}'
);
