-- CreateEnum
CREATE TYPE "SeriesRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventSeries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "timeZone" TEXT NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "notifyWebex" BOOLEAN NOT NULL DEFAULT false,
    "recurrence" "SeriesRecurrence" NOT NULL,
    "recurrenceEndsAt" TIMESTAMP(3),
    "anchorStartsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastExpandedUntilUtc" TIMESTAMP(3),

    CONSTRAINT "CalendarEventSeries_pkey" PRIMARY KEY ("id")
);

-- AlterTable CalendarEvent — add FK columns before constraints
ALTER TABLE "CalendarEvent" ADD COLUMN "teamId" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "seriesId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex (CalendarEvent)
CREATE INDEX "CalendarEvent_teamId_idx" ON "CalendarEvent"("teamId");

CREATE INDEX "CalendarEvent_seriesId_idx" ON "CalendarEvent"("seriesId");

-- Unique composite: Outlook rows keep seriesId NULL (Postgres UNIQUE allows multiple NULLs in seriesId)
CREATE UNIQUE INDEX "CalendarEvent_series_starts_unique"
    ON "CalendarEvent" ("seriesId", "startsAt");

-- AddForeignKey
ALTER TABLE "CalendarEventSeries" ADD CONSTRAINT "CalendarEventSeries_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "CalendarEventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
