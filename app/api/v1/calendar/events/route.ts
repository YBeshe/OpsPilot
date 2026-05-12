export const runtime = "nodejs";

import { CalendarSource, WebexDeliveryStatus } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonErr, jsonOk } from "@/lib/api/envelope";
import { recordAudit } from "@/lib/audit";
import { serializeCalendarEvent } from "@/lib/calendar/serialize-event";
import { prisma } from "@/lib/db/prisma";
import { correlationFromHeaders } from "@/lib/http/correlation";
import { sendWebexMarkdown } from "@/lib/integrations/webex/messages";

function defaultWindow() {
  const from = new Date();
  from.setDate(from.getDate() - 21);
  from.setHours(0, 0, 0, 0);

  const to = new Date();
  to.setDate(to.getDate() + 180);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

export async function GET(request: NextRequest) {
  const correlationId = correlationFromHeaders();
  const fallback = defaultWindow();
  const params = request.nextUrl.searchParams;

  let windowStart = params.get("from") ?
      new Date(params.get("from")!)
    : fallback.from;
  let windowEnd =
    params.get("to") ? new Date(params.get("to")!) : fallback.to;

  if (
    Number.isNaN(windowStart.getTime())
    || Number.isNaN(windowEnd.getTime())
  ) {
    return jsonErr(
      "invalid_window",
      "Use ISO timestamps for from/to.",
      correlationId,
      400,
    );
  }

  if (windowStart > windowEnd) {
    const swap = windowStart;
    windowStart = windowEnd;
    windowEnd = swap;
  }

  const rows = await prisma.calendarEvent.findMany({
    where: {
      startsAt: { lte: windowEnd },
      endsAt: { gte: windowStart },
    },
    orderBy: { startsAt: "asc" },
  });

  return jsonOk(
    {
      window: {
        from: windowStart.toISOString(),
        to: windowEnd.toISOString(),
      },
      events: rows.map(serializeCalendarEvent),
    },
    correlationId,
  );
}

const CreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(6000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  timeZone: z.string().min(1).max(64),
  allDay: z.boolean().optional(),
  notifyWebex: z.boolean().optional(),
});

export async function POST(request: Request) {
  const correlationId = correlationFromHeaders();
  let parsed: z.infer<typeof CreateSchema>;
  try {
    parsed = CreateSchema.parse(await request.json());
  } catch (error) {
    return jsonErr(
      "invalid_body",
      error instanceof Error ? error.message : "invalid_json",
      correlationId,
      400,
    );
  }

  const startsAt = new Date(parsed.startsAt);
  const endsAt = new Date(parsed.endsAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return jsonErr("invalid_dates", "Use ISO timestamps.", correlationId, 400);
  }
  if (endsAt <= startsAt) {
    return jsonErr(
      "invalid_dates",
      "endsAt must come after startsAt.",
      correlationId,
      400,
    );
  }

  const created = await prisma.calendarEvent.create({
    data: {
      title: parsed.title.trim(),
      description:
        parsed.description === undefined ? undefined : (
          parsed.description?.trim() ?? null
        ),
      location:
        parsed.location === undefined ? undefined : (
          parsed.location?.trim() ?? null
        ),
      startsAt,
      endsAt,
      timeZone: parsed.timeZone.trim(),
      allDay: Boolean(parsed.allDay),
      source: CalendarSource.INTERNAL,
      notifyWebex: Boolean(parsed.notifyWebex),
    },
  });

  let deliveryState: WebexDeliveryStatus = WebexDeliveryStatus.NONE;
  let webexDetail: string | null = null;
  let webexHttp: number | null = null;

  if (!parsed.notifyWebex) {
    deliveryState = WebexDeliveryStatus.NONE;
  } else {
    const markdown = composeWebexMessage(created.title, startsAt, endsAt);
    const result = await sendWebexMarkdown({ markdown });

    if (result.ok) {
      deliveryState = WebexDeliveryStatus.SENT;
      webexHttp = result.httpStatus;
      webexDetail =
        typeof result.messageId === "string" ?
          `messageId:${result.messageId}`
        : "sent";
    } else if (
      result.skippedReason === "missing_bot_token"
      || result.skippedReason === "missing_room_id"
    ) {
      deliveryState = WebexDeliveryStatus.SKIPPED;
      webexDetail = result.skippedReason;
    } else {
      deliveryState = WebexDeliveryStatus.FAILED;
      webexDetail = result.detail ?? result.skippedReason;
      webexHttp = typeof result.httpStatus === "number" ?
          result.httpStatus
        : null;
    }
  }

  const updated = await prisma.calendarEvent.update({
    where: { id: created.id },
    data: {
      webexDelivery: deliveryState,
      webexHttpStatus: webexHttp,
      webexDetail: webexDetail?.slice(0, 900) ?? null,
    },
  });

  await recordAudit({
    correlationId,
    action: "calendar.event.created",
    resourceType: "CalendarEvent",
    resourceId: updated.id,
    payload: {
      notifyWebex: Boolean(parsed.notifyWebex),
      delivery: deliveryState,
    },
  });

  return jsonOk(
    {
      event: serializeCalendarEvent(updated),
    },
    correlationId,
    { status: 201 },
  );
}

function composeWebexMessage(title: string, startsAt: Date, endsAt: Date) {
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
