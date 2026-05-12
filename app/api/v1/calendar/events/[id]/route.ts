export const runtime = "nodejs";

import { CalendarSource } from "@prisma/client";
import { z } from "zod";

import { jsonErr, jsonOk } from "@/lib/api/envelope";
import { recordAudit } from "@/lib/audit";
import { serializeCalendarEvent } from "@/lib/calendar/serialize-event";
import { prisma } from "@/lib/db/prisma";
import { correlationFromHeaders } from "@/lib/http/correlation";

const PatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(6000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  timeZone: z.string().min(1).max(64).optional(),
  allDay: z.boolean().optional(),
});

function isMutable(event: { source: CalendarSource; outlookEventId: string | null }) {
  return event.source === CalendarSource.INTERNAL && !event.outlookEventId;
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } },
) {
  const correlationId = correlationFromHeaders();
  const id = context.params.id;

  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) {
    return jsonErr("not_found", "Calendar event was not found.", correlationId, 404);
  }

  if (!isMutable(existing)) {
    return jsonErr(
      "read_only",
      "Outlook-sourced events are managed by Microsoft 365. Remove them in Outlook or run a sync.",
      correlationId,
      409,
    );
  }

  if (existing.seriesId) {
    return jsonErr(
      "series_member",
      "This occurrence belongs to a recurring series; it cannot be edited here. Delete it if needed, or change the series definition in a future release.",
      correlationId,
      409,
    );
  }

  let parsed: z.infer<typeof PatchSchema>;
  try {
    parsed = PatchSchema.parse(await request.json());
  } catch (error) {
    return jsonErr(
      "invalid_body",
      error instanceof Error ? error.message : "invalid_json",
      correlationId,
      400,
    );
  }

  const nextStarts =
    parsed.startsAt ? new Date(parsed.startsAt) : existing.startsAt;
  const nextEnds = parsed.endsAt ? new Date(parsed.endsAt) : existing.endsAt;

  if (parsed.startsAt && Number.isNaN(nextStarts.getTime())) {
    return jsonErr("invalid_dates", "startsAt is not a valid timestamp.", correlationId, 400);
  }
  if (parsed.endsAt && Number.isNaN(nextEnds.getTime())) {
    return jsonErr("invalid_dates", "endsAt is not a valid timestamp.", correlationId, 400);
  }
  if (nextEnds <= nextStarts) {
    return jsonErr("invalid_dates", "endsAt must be after startsAt.", correlationId, 400);
  }

  const updated = await prisma.calendarEvent.update({
    where: { id },
    data: {
      title: parsed.title?.trim() ?? undefined,
      description:
        parsed.description === undefined ? undefined : (
          parsed.description?.trim() ?? null
        ),
      location:
        parsed.location === undefined ? undefined : parsed.location?.trim() ?? null,
      startsAt: parsed.startsAt ? nextStarts : undefined,
      endsAt: parsed.endsAt ? nextEnds : undefined,
      timeZone: parsed.timeZone?.trim() ?? undefined,
      allDay: typeof parsed.allDay === "boolean" ? parsed.allDay : undefined,
    },
    include: {
      team: { select: { id: true, name: true, slug: true } },
      series: {
        select: {
          id: true,
          recurrence: true,
          recurrenceEndsAt: true,
          active: true,
        },
      },
    },
  });

  await recordAudit({
    correlationId,
    action: "calendar.event.updated",
    resourceType: "CalendarEvent",
    resourceId: updated.id,
  });

  return jsonOk(
    {
      event: serializeCalendarEvent(updated, {
        team: updated.team ?? undefined,
        series: updated.series ?? undefined,
      }),
    },
    correlationId,
  );
}

export async function DELETE(
  _: Request,
  context: { params: { id: string } },
) {
  const correlationId = correlationFromHeaders();
  const id = context.params.id;

  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) {
    return jsonErr("not_found", "Calendar event was not found.", correlationId, 404);
  }

  if (!isMutable(existing)) {
    return jsonErr(
      "read_only",
      "Outlook-sourced events must be cancelled in Outlook. Run sync to reconcile.",
      correlationId,
      409,
    );
  }

  await prisma.calendarEvent.delete({ where: { id } });

  await recordAudit({
    correlationId,
    action: "calendar.event.deleted",
    resourceType: "CalendarEvent",
    resourceId: id,
  });

  return jsonOk({ deleted: true, id }, correlationId);
}
