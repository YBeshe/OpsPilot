import { WebexDeliveryStatus } from "@prisma/client";

import {
  advanceSeriesUtc,
  occurrenceStartsBeforeOrEqual,
  recurrenceHorizonEndUtc,
  utcEndFromStartAndDurationMinutes,
} from "@/lib/calendar/recurrence";
import { prisma } from "@/lib/db/prisma";
import { sendWebexMarkdown } from "@/lib/integrations/webex/messages";

const MAX_SERIES_STEPS = 10_000;

export async function finalizeWebexForOccurrence(opts: {
  notifyWebex: boolean;
  title: string;
  startsAt: Date;
  endsAt: Date;
}) {
  if (!opts.notifyWebex) {
    return {
      deliveryState: WebexDeliveryStatus.NONE,
      webexDetail: null as string | null,
      webexHttp: null as number | null,
    };
  }

  const markdown = composeWebexMarkdown(opts.title, opts.startsAt, opts.endsAt);
  const result = await sendWebexMarkdown({ markdown });

  if (result.ok) {
    return {
      deliveryState: WebexDeliveryStatus.SENT,
      webexHttp: result.httpStatus,
      webexDetail:
        typeof result.messageId === "string" ?
          `messageId:${result.messageId}`
        : "sent",
    };
  }

  if (
    result.skippedReason === "missing_bot_token"
    || result.skippedReason === "missing_room_id"
  ) {
    return {
      deliveryState: WebexDeliveryStatus.SKIPPED,
      webexDetail: result.skippedReason,
      webexHttp: typeof result.httpStatus === "number" ?
          result.httpStatus
        : null,
    };
  }

  return {
    deliveryState: WebexDeliveryStatus.FAILED,
    webexDetail: result.detail ?? result.skippedReason,
    webexHttp:
      typeof result.httpStatus === "number" ? result.httpStatus : null,
  };
}

export async function ensureOccurrenceUpsert(opts: {
  seriesId: string;
  startsAtUtc: Date;
  endsAtUtc: Date;
  snapshot: {
    title: string;
    description?: string | null;
    location?: string | null;
    timeZone: string;
    allDay: boolean;
    /** When true, only the first materialized occurrence for the series pings Webex. */
    notifyFirstWebexOnly: boolean;
    seriesDefaultsNotifyWebex: boolean;
    teamId: string;
  };
}) {
  const whereUnique = {
    seriesId_startsAt: {
      seriesId: opts.seriesId,
      startsAt: opts.startsAtUtc,
    },
  };

  const existing = await prisma.calendarEvent.findUnique({ where: whereUnique });

  if (existing) {
    return {
      row: existing,
      created: false as const,
    };
  }

  let deliveryState: WebexDeliveryStatus = WebexDeliveryStatus.NONE;
  let webexDetail: string | null = null;
  let webexHttp: number | null = null;

  const siblingCountBeforeInsert = await prisma.calendarEvent.count({
    where: { seriesId: opts.seriesId },
  });

  const shouldPingWebex =
    opts.snapshot.seriesDefaultsNotifyWebex
    && (!opts.snapshot.notifyFirstWebexOnly || siblingCountBeforeInsert === 0);

  if (shouldPingWebex) {
    const finalized = await finalizeWebexForOccurrence({
      notifyWebex: true,
      title: opts.snapshot.title,
      startsAt: opts.startsAtUtc,
      endsAt: opts.endsAtUtc,
    });
    deliveryState = finalized.deliveryState;
    webexDetail =
      finalized.webexDetail ? finalized.webexDetail.slice(0, 900) : null;
    webexHttp =
      typeof finalized.webexHttp === "number" ? finalized.webexHttp : null;
  }

  const row = await prisma.calendarEvent.create({
    data: {
      title: opts.snapshot.title,
      description: opts.snapshot.description ?? null,
      location: opts.snapshot.location ?? null,
      startsAt: opts.startsAtUtc,
      endsAt: opts.endsAtUtc,
      timeZone: opts.snapshot.timeZone,
      allDay: opts.snapshot.allDay,
      notifyWebex: opts.snapshot.seriesDefaultsNotifyWebex,
      webexDelivery: deliveryState,
      webexHttpStatus: webexHttp,
      webexDetail,
      seriesId: opts.seriesId,
      teamId: opts.snapshot.teamId,
      source: "INTERNAL",
    },
  });

  return { row, created: true as const };
}

function composeWebexMarkdown(title: string, startsAt: Date, endsAt: Date) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  });

  const safeTitle = title.replace(/\s+/g, " ").slice(0, 400);

  return [
    "**OpsPilot calendar reminder**",
    "",
    `- **${safeTitle}**`,
    `- Starts ${formatter.format(startsAt)} (${zone})`,
    `- Ends ${formatter.format(endsAt)} (${zone})`,
    "",
    "_Reminder generated automatically from OpsPilot._",
  ].join("\n");
}

export async function expandSeriesUntilUtc(seriesId: string, untilUtc: Date) {
  const series = await prisma.calendarEventSeries.findUnique({
    where: { id: seriesId },
  });
  if (!series?.active) {
    return { created: 0 };
  }

  const recurrenceEnds = recurrenceHorizonEndUtc({
    untilUtc,
    recurrenceEndsAt: series.recurrenceEndsAt,
  });

  let created = 0;
  let cursor = new Date(series.anchorStartsAt.getTime());

  const hardStop = recurrenceEnds.getTime();
  let steps = 0;

  while (occurrenceStartsBeforeOrEqual(cursor, hardStop)) {
    steps += 1;
    if (steps > MAX_SERIES_STEPS) break;

    const endsCursor = utcEndFromStartAndDurationMinutes(
      cursor,
      series.durationMinutes,
    );

    const res = await ensureOccurrenceUpsert({
      seriesId,
      startsAtUtc: cursor,
      endsAtUtc: endsCursor,
      snapshot: {
        title: series.title,
        description: series.description,
        location: series.location,
        timeZone: series.timeZone,
        allDay: series.allDay,
        notifyFirstWebexOnly: true,
        seriesDefaultsNotifyWebex: series.notifyWebex,
        teamId: series.teamId,
      },
    });

    if (res.created) created += 1;

    const nextStart = advanceSeriesUtc(cursor, series.recurrence);
    if (nextStart.getTime() <= cursor.getTime()) break;
    cursor = nextStart;
  }

  const prevExpanded = series.lastExpandedUntilUtc?.getTime() ?? 0;
  await prisma.calendarEventSeries.update({
    where: { id: seriesId },
    data: {
      lastExpandedUntilUtc: new Date(
        Math.max(prevExpanded, recurrenceEnds.getTime()),
      ),
    },
  });

  return { created };
}

export async function expandAllSeries(untilUtc: Date) {
  const active = await prisma.calendarEventSeries.findMany({
    where: { active: true },
    select: { id: true },
  });

  let total = 0;
  for (const row of active) {
    const { created } = await expandSeriesUntilUtc(row.id, untilUtc);
    total += created;
  }
  return { seriesTouched: active.length, occurrencesCreated: total };
}
