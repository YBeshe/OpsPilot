import type {
  CalendarEvent,
  CalendarEventSeries,
  Team,
} from "@prisma/client";

export type CalendarEventSerialized = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  allDay: boolean;
  source: CalendarEvent["source"];
  outlookEventId: string | null;
  outlookWebLink: string | null;
  notifyWebex: boolean;
  webexDelivery: CalendarEvent["webexDelivery"];
  webexHttpStatus: number | null;
  teamId: string | null;
  seriesId: string | null;
  team:
    | {
        id: string;
        name: string;
        slug: string;
      }
    | null;
  series:
    | {
        id: string;
        recurrence: CalendarEventSeries["recurrence"];
        recurrenceEndsAt: string | null;
        active: boolean;
      }
    | null;
};

export function serializeCalendarEvent(
  event: CalendarEvent,
  extras?:
    | {
        team?:
          | Pick<Team, "id" | "name" | "slug">
          | null
          | undefined;
        series?:
          | Pick<
              CalendarEventSeries,
              | "id"
              | "recurrence"
              | "recurrenceEndsAt"
              | "active"
            >
          | null
          | undefined;
      }
    | undefined,
): CalendarEventSerialized {
  const team = extras?.team ?? null;
  const seriesRow = extras?.series ?? null;

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timeZone: event.timeZone,
    allDay: event.allDay,
    source: event.source,
    outlookEventId: event.outlookEventId,
    outlookWebLink: event.outlookWebLink,
    notifyWebex: event.notifyWebex,
    webexDelivery: event.webexDelivery,
    webexHttpStatus: event.webexHttpStatus,
    teamId: event.teamId,
    seriesId: event.seriesId,
    team,
    series:
      seriesRow ?
        {
          id: seriesRow.id,
          recurrence: seriesRow.recurrence,
          recurrenceEndsAt:
            seriesRow.recurrenceEndsAt ?
              seriesRow.recurrenceEndsAt.toISOString()
            : null,
          active: seriesRow.active,
        }
      : null,
  };
}
