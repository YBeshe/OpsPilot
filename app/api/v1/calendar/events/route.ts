export const runtime = "nodejs";

import { CalendarSource, type SeriesRecurrence } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonErr, jsonOk } from "@/lib/api/envelope";
import { recordAudit } from "@/lib/audit";
import { expandSeriesUntilUtc, finalizeWebexForOccurrence } from "@/lib/calendar/event-materialize";
import { materializationHorizonUtc } from "@/lib/calendar/materialization-horizon";
import { serializeCalendarEvent } from "@/lib/calendar/serialize-event";
import {
  interpretPlainLanguageEvent,
  type PlainLanguageInterpretation,
} from "@/lib/calendar/plain-language-schedule";
import { prisma } from "@/lib/db/prisma";
import { correlationFromHeaders } from "@/lib/http/correlation";

function defaultWindow() {
  const from = new Date();
  from.setDate(from.getDate() - 21);
  from.setHours(0, 0, 0, 0);

  const to = new Date();
  to.setDate(to.getDate() + 180);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

const RecurrenceEnum = z.enum([
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
]);

const CreateSchema = z.object({
  quickAdd: z.string().max(4000).optional(),
  title: z.string().max(500).optional(),
  description: z.string().max(6000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  timeZone: z.string().min(1).max(64).optional(),
  allDay: z.boolean().optional(),
  notifyWebex: z.boolean().optional(),
  teamId: z.string().cuid().optional(),
  recurrence: RecurrenceEnum.optional(),
  recurrenceEndsAt: z.string().min(1).optional().nullable(),
});

async function resolveTeamId(input?: string | null) {
  if (input) {
    const team = await prisma.team.findUnique({ where: { id: input } });
    if (!team) return { ok: false as const, code: "unknown_team" };
    return { ok: true as const, teamId: team.id };
  }
  const first = await prisma.team.findFirst({ orderBy: { name: "asc" } });
  if (!first) return { ok: false as const, code: "no_teams" };
  return { ok: true as const, teamId: first.id };
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

  const rawTeamFilter = params.get("teamId");
  let teamFilter: string | undefined;
  if (rawTeamFilter) {
    const parsedTeam = z.string().cuid().safeParse(rawTeamFilter);
    if (!parsedTeam.success) {
      return jsonErr(
        "invalid_team_filter",
        "teamId must be a valid id when provided.",
        correlationId,
        400,
      );
    }
    teamFilter = parsedTeam.data;
  }

  const rows = await prisma.calendarEvent.findMany({
    where: {
      startsAt: { lte: windowEnd },
      endsAt: { gte: windowStart },
      ...(teamFilter ? { teamId: teamFilter } : {}),
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      series: {
        select: {
          id: true,
          recurrence: true,
          recurrenceEndsAt: true,
          active: true,
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  return jsonOk(
    {
      window: {
        from: windowStart.toISOString(),
        to: windowEnd.toISOString(),
      },
      events: rows.map((row) =>
        serializeCalendarEvent(row, {
          team: row.team ?? undefined,
          series: row.series ?? undefined,
        }),
      ),
    },
    correlationId,
  );
}

export async function POST(request: Request) {
  const correlationId = correlationFromHeaders();
  let p: z.infer<typeof CreateSchema>;
  try {
    p = CreateSchema.parse(await request.json());
  } catch (error) {
    return jsonErr(
      "invalid_body",
      error instanceof Error ? error.message : "invalid_json",
      correlationId,
      400,
    );
  }

  const tz = (p.timeZone ?? "UTC").trim();
  const quickAdd = p.quickAdd?.trim();
  const structuredTitle = p.title?.trim();
  const structuredCoreReady =
    Boolean(structuredTitle) && Boolean(p.startsAt && p.endsAt);

  if (!quickAdd && !structuredCoreReady) {
    return jsonErr(
      "incomplete_payload",
      "Provide plain-language scheduling in quickAdd, or send title plus startsAt and endsAt.",
      correlationId,
      400,
    );
  }

  const teamsCatalog = await prisma.team.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  let interpreted: PlainLanguageInterpretation | null = null;
  if (quickAdd) {
    const out = interpretPlainLanguageEvent(quickAdd, {
      instant: new Date(),
      timeZone: tz,
      teams: teamsCatalog,
    });
    if (!out.ok) {
      return jsonErr("quick_add_parse", out.message, correlationId, 400);
    }
    interpreted = out.value;
  }

  const title = (structuredTitle ?? interpreted?.title ?? "").trim();
  if (!title) {
    return jsonErr(
      "incomplete_payload",
      "Title is missing. Add title in the JSON body or clarify it inside quickAdd.",
      correlationId,
      400,
    );
  }

  let startsAt: Date | undefined;
  let endsAt: Date | undefined;

  /** Plain-language line must own the timestamps so browser datetime-local values do not silently override parsed text */
  if (quickAdd && interpreted) {
    startsAt = interpreted.startsAt;
    endsAt = interpreted.endsAt;
  } else {
    if (p.startsAt) {
      startsAt = new Date(p.startsAt);
      if (Number.isNaN(startsAt.getTime())) {
        return jsonErr(
          "invalid_dates",
          "startsAt is not a valid timestamp.",
          correlationId,
          400,
        );
      }
    } else if (interpreted) {
      startsAt = interpreted.startsAt;
    }

    if (p.endsAt) {
      endsAt = new Date(p.endsAt);
      if (Number.isNaN(endsAt.getTime())) {
        return jsonErr(
          "invalid_dates",
          "endsAt is not a valid timestamp.",
          correlationId,
          400,
        );
      }
    } else if (interpreted) {
      endsAt = interpreted.endsAt;
    }
  }

  if (
    !startsAt
    || !endsAt
    || Number.isNaN(startsAt.getTime())
    || Number.isNaN(endsAt.getTime())
    || endsAt <= startsAt
  ) {
    return jsonErr(
      "invalid_dates",
      "Ends must come after start. Provide valid ISO timestamps, or clearer date/time wording in quickAdd.",
      correlationId,
      400,
    );
  }

  const recurrenceCombined = (
    p.recurrence ?? interpreted?.recurrence
  ) as SeriesRecurrence | undefined;

  let recurrenceEndsAt: Date | null = null;
  if (recurrenceCombined) {
    if (p.recurrenceEndsAt) {
      recurrenceEndsAt = new Date(p.recurrenceEndsAt);
      if (Number.isNaN(recurrenceEndsAt.getTime())) {
        return jsonErr(
          "invalid_recurrence_end",
          "recurrenceEndsAt must be a valid ISO timestamp when provided.",
          correlationId,
          400,
        );
      }
      if (recurrenceEndsAt <= startsAt) {
        return jsonErr(
          "invalid_recurrence_end",
          "recurrenceEndsAt must come after startsAt.",
          correlationId,
          400,
        );
      }
    } else if (interpreted?.recurrenceEndsAt) {
      recurrenceEndsAt = interpreted.recurrenceEndsAt;
      if (recurrenceEndsAt <= startsAt) {
        return jsonErr(
          "invalid_recurrence_end",
          "Recurrence \"until\" date must come after the first occurrence start.",
          correlationId,
          400,
        );
      }
    }
  }

  const notifyWebex = Boolean(p.notifyWebex) || Boolean(interpreted?.notifyWebex);

  const hintedTeamId = p.teamId ?? interpreted?.teamIdHint;
  const team = await resolveTeamId(hintedTeamId);
  if (!team.ok) {
    return jsonErr(
      team.code,
      team.code === "unknown_team" ?
        "teamId does not match a known team."
      : "No teams configured. Seed teams before creating calendar items.",
      correlationId,
      400,
    );
  }

  const durationMinutes = Math.max(
    1,
    Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
  );

  if (recurrenceCombined) {
    const series = await prisma.calendarEventSeries.create({
      data: {
        teamId: team.teamId,
        title,
        description:
          p.description === undefined ? null : (
            p.description?.trim() ?? null
          ),
        location:
          p.location === undefined ? null : p.location?.trim() ?? null,
        timeZone: tz,
        allDay: Boolean(p.allDay),
        notifyWebex,
        recurrence: recurrenceCombined,
        recurrenceEndsAt,
        anchorStartsAt: startsAt,
        durationMinutes,
        active: true,
      },
    });

    const untilUtc = materializationHorizonUtc();
    const expanded = await expandSeriesUntilUtc(series.id, untilUtc);

    await recordAudit({
      correlationId,
      action: "calendar.series.created",
      resourceType: "CalendarEventSeries",
      resourceId: series.id,
      payload: {
        recurrence: recurrenceCombined,
        occurrencesCreated: expanded.created,
        horizonUntilUtc: untilUtc.toISOString(),
        teamId: team.teamId,
        usedQuickAdd: Boolean(quickAdd),
      },
    });

    return jsonOk(
      {
        series: {
          id: series.id,
          recurrence: series.recurrence,
          teamId: series.teamId,
          anchorStartsAt: series.anchorStartsAt.toISOString(),
          recurrenceEndsAt:
            series.recurrenceEndsAt?.toISOString() ?? null,
          durationMinutes: series.durationMinutes,
          notifyWebex: series.notifyWebex,
        },
        occurrencesMaterialized: expanded.created,
        materializedUntilUtc: untilUtc.toISOString(),
      },
      correlationId,
      { status: 201 },
    );
  }

  const row = await prisma.calendarEvent.create({
    data: {
      title,
      description:
        p.description === undefined ? undefined : (
          p.description?.trim() ?? null
        ),
      location:
        p.location === undefined ? undefined : p.location?.trim() ?? null,
      startsAt,
      endsAt,
      timeZone: tz,
      allDay: Boolean(p.allDay),
      source: CalendarSource.INTERNAL,
      notifyWebex,
      teamId: team.teamId,
    },
  });

  const finalized = await finalizeWebexForOccurrence({
    notifyWebex,
    title: row.title,
    startsAt,
    endsAt,
  });

  const updated = await prisma.calendarEvent.update({
    where: { id: row.id },
    data: {
      webexDelivery: finalized.deliveryState,
      webexHttpStatus:
        typeof finalized.webexHttp === "number" ? finalized.webexHttp : null,
      webexDetail: finalized.webexDetail?.slice(0, 900) ?? null,
    },
  });

  await recordAudit({
    correlationId,
    action: "calendar.event.created",
    resourceType: "CalendarEvent",
    resourceId: updated.id,
    payload: {
      notifyWebex,
      delivery: finalized.deliveryState,
      teamId: team.teamId,
      usedQuickAdd: Boolean(quickAdd),
    },
  });

  const filled = await prisma.calendarEvent.findUnique({
    where: { id: updated.id },
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

  return jsonOk(
    {
      event:
        filled ?
          serializeCalendarEvent(filled, {
            team: filled.team ?? undefined,
            series: filled.series ?? undefined,
          })
        : serializeCalendarEvent(updated),
    },
    correlationId,
    { status: 201 },
  );
}
