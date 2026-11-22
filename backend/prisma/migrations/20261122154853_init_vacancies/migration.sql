-- CreateTable
CREATE TABLE "vacancies" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "salary" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'new',
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vacancies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vacancies_status_idx" ON "vacancies"("status");

-- CreateIndex
CREATE INDEX "vacancies_source_idx" ON "vacancies"("source");

-- CreateIndex
CREATE INDEX "vacancies_published_at_idx" ON "vacancies"("published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "vacancies_source_external_id_key" ON "vacancies"("source", "external_id");
