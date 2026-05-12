import { CalendarSource, WebexDeliveryStatus } from "@prisma/client";

import { openSecret, sealSecret } from "@/lib/crypto/integration-token";
import { prisma } from "@/lib/db/prisma";
import { OUTLOOK_CREDENTIAL_ID } from "@/lib/integrations/constants";
import type { MicrosoftOAuthEnv } from "@/lib/integrations/microsoft/config";
import { refreshAccessToken } from "@/lib/integrations/microsoft/oauth";

export type OutlookSyncSummary = {
  pulled: number;
  cancelled: number;
};

type GraphEnvelope<T> = { value?: T[]; "@odata.nextLink"?: string };

async function acquireAccessToken(
  oauthEnv: MicrosoftOAuthEnv,
): Promise<{ access_token: string }> {
  const row = await prisma.outlookCalendarCredential.findUnique({
    where: { id: OUTLOOK_CREDENTIAL_ID },
  });
  if (!row?.encryptedRefreshToken || !row.scope) {
    throw new Error(
      "Outlook is not connected. Complete Microsoft sign-in before syncing.",
    );
  }

  const refresh = openSecret(row.encryptedRefreshToken);
  const token = await refreshAccessToken({
    env: oauthEnv,
    refreshToken: refresh,
    scopeFallback: row.scope,
  });

  if (!token.access_token) {
    throw new Error("Microsoft token response missing access_token.");
  }

  if (token.refresh_token && token.refresh_token !== refresh) {
    await prisma.outlookCalendarCredential.update({
      where: { id: OUTLOOK_CREDENTIAL_ID },
      data: {
        encryptedRefreshToken: sealSecret(token.refresh_token),
        scope: token.scope ?? row.scope,
      },
    });
  }

  return { access_token: token.access_token };
}

async function graphFetchPages<T>(
  accessToken: string,
  initialUrl: string,
): Promise<T[]> {
  const results: T[] = [];
  let next: string | undefined = initialUrl;
  while (next) {
    const res = await fetch(next, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
    const json = (await res.json()) as GraphEnvelope<T> & {
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(json.error?.message ?? `Graph request failed (${res.status}).`);
    }
    if (Array.isArray(json.value)) {
      results.push(...json.value);
    }
    next =
      typeof json["@odata.nextLink"] === "string" ?
        json["@odata.nextLink"]
      : undefined;
  }
  return results;
}

export async function syncOutlookCalendarWindow(opts: {
  oauthEnv: MicrosoftOAuthEnv;
  horizonDaysAhead: number;
}): Promise<OutlookSyncSummary> {
  const { access_token } = await acquireAccessToken(opts.oauthEnv);

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - 7);

  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + opts.horizonDaysAhead);
  windowEnd.setHours(23, 59, 59, 999);

  const url = new URL(
    "https://graph.microsoft.com/v1.0/me/calendar/calendarView",
  );
  url.searchParams.set("startDateTime", windowStart.toISOString());
  url.searchParams.set("endDateTime", windowEnd.toISOString());
  url.searchParams.set("$top", "250");
  url.searchParams.set(
    "$select",
    [
      "id",
      "iCalUId",
      "subject",
      "body",
      "location",
      "isCancelled",
      "isAllDay",
      "start",
      "end",
      "webLink",
    ].join(","),
  );

  type GraphEvt = {
    id: string;
    iCalUId?: string;
    webLink?: string;
    subject?: string;
    isCancelled?: boolean;
    isAllDay?: boolean;
    body?: { content?: string };
    location?: { displayName?: string };
    start?: { dateTime?: string; timeZone?: string; date?: string };
    end?: { dateTime?: string; timeZone?: string; date?: string };
  };

  const events = await graphFetchPages<GraphEvt>(
    access_token,
    url.toString(),
  );

  let pulled = 0;
  let cancelled = 0;

  for (const evt of events) {
    if (!evt.id) continue;

    if (evt.isCancelled) {
      const removed = await prisma.calendarEvent.deleteMany({
        where: { outlookEventId: evt.id },
      });
      cancelled += removed.count;
      continue;
    }

    const parsedStart = extractGraphMoment(evt.start, Boolean(evt.isAllDay));
    const parsedEnd = extractGraphMoment(evt.end, Boolean(evt.isAllDay));

    if (!parsedStart || !parsedEnd || !evt.subject?.trim()) {
      continue;
    }

    const description = coerceBodyText(evt.body?.content ?? "");
    const location = evt.location?.displayName?.trim() ?? null;
    const timeZoneGuess =
      evt.start?.timeZone ||
      evt.end?.timeZone ||
      parsedStart.tzGuess ||
      parsedEnd.tzGuess ||
      "UTC";

    await prisma.calendarEvent.upsert({
      where: { outlookEventId: evt.id },
      create: {
        title: evt.subject.trim(),
        description,
        location,
        startsAt: parsedStart.utc,
        endsAt: parsedEnd.utc,
        timeZone: timeZoneGuess,
        allDay: Boolean(evt.isAllDay),
        source: CalendarSource.OUTLOOK,
        outlookEventId: evt.id,
        outlookICalUid: evt.iCalUId ?? null,
        outlookWebLink: evt.webLink ?? null,
        notifyWebex: false,
        webexDelivery: WebexDeliveryStatus.NONE,
      },
      update: {
        title: evt.subject.trim(),
        description,
        location,
        startsAt: parsedStart.utc,
        endsAt: parsedEnd.utc,
        timeZone: timeZoneGuess,
        allDay: Boolean(evt.isAllDay),
        source: CalendarSource.OUTLOOK,
        outlookICalUid: evt.iCalUId ?? null,
        outlookWebLink: evt.webLink ?? null,
      },
    });

    pulled += 1;
  }

  return { pulled, cancelled };
}

export function coerceBodyText(content: string) {
  if (!content.trim()) return null;
  const stripped = content
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
  return stripped.length > 0 ? stripped : null;
}

function extractGraphMoment(
  value:
    | { dateTime?: string; timeZone?: string; date?: string }
    | undefined,
  allDay: boolean,
): { utc: Date; tzGuess?: string } | null {
  if (!value) return null;

  if (allDay && value.date) {
    const utc = new Date(`${value.date}T12:00:00Z`);
    return { utc, tzGuess: "UTC" };
  }

  if (!value.dateTime) return null;
  return {
    utc: new Date(value.dateTime),
    tzGuess: value.timeZone ?? undefined,
  };
}
