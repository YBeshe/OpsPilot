import type { CalendarEvent } from "@prisma/client";

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
};

export function serializeCalendarEvent(event: CalendarEvent): CalendarEventSerialized {
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
  };
}
