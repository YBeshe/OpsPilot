-- CreateEnum
CREATE TYPE "CalendarSource" AS ENUM ('INTERNAL', 'OUTLOOK');

-- CreateEnum
CREATE TYPE "WebexDeliveryStatus" AS ENUM ('NONE', 'SKIPPED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "source" "CalendarSource" NOT NULL DEFAULT 'INTERNAL',
    "outlookEventId" TEXT,
    "outlookICalUid" TEXT,
    "outlookWebLink" TEXT,
    "notifyWebex" BOOLEAN NOT NULL DEFAULT false,
    "webexDelivery" "WebexDeliveryStatus" NOT NULL DEFAULT 'NONE',
    "webexHttpStatus" INTEGER,
    "webexDetail" TEXT,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthPkceState" (
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthPkceState_pkey" PRIMARY KEY ("state")
);

-- CreateTable
CREATE TABLE "OutlookCalendarCredential" (
    "id" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "scope" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantIdUsed" TEXT,
    "azureAdUserObjectId" TEXT,
    "userPrincipalName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutlookCalendarCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_outlookEventId_key" ON "CalendarEvent"("outlookEventId");

-- CreateIndex
CREATE INDEX "CalendarEvent_startsAt_idx" ON "CalendarEvent"("startsAt" ASC);

-- CreateIndex
CREATE INDEX "OAuthPkceState_createdAt_idx" ON "OAuthPkceState"("createdAt" ASC);
