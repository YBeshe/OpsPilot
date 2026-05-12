import type { SeriesRecurrence } from "@prisma/client";

export function utcEndFromStartAndDurationMinutes(
  startUtc: Date,
  durationMinutes: number,
) {
  const end = new Date(startUtc.getTime() + durationMinutes * 60_000);
  return end;
}

export function occurrenceStartsBeforeOrEqual(cursorMs: Date, inclusiveEndMs: number) {
  return cursorMs.getTime() <= inclusiveEndMs;
}

export function advanceSeriesUtc(startUtc: Date, freq: SeriesRecurrence): Date {
  const y = startUtc.getUTCFullYear();
  const m = startUtc.getUTCMonth();
  const d = startUtc.getUTCDate();
  const hh = startUtc.getUTCHours();
  const mm = startUtc.getUTCMinutes();
  const ss = startUtc.getUTCSeconds();
  const ms = startUtc.getUTCMilliseconds();

  switch (freq) {
    case "DAILY":
      return new Date(Date.UTC(y, m, d + 1, hh, mm, ss, ms));
    case "WEEKLY":
      return new Date(Date.UTC(y, m, d + 7, hh, mm, ss, ms));
    case "BIWEEKLY":
      return new Date(Date.UTC(y, m, d + 14, hh, mm, ss, ms));
    case "MONTHLY":
      return new Date(Date.UTC(y, m + 1, d, hh, mm, ss, ms));
    case "QUARTERLY":
      return new Date(Date.UTC(y, m + 3, d, hh, mm, ss, ms));
    default:
      return new Date(Date.UTC(y, m, d + 1, hh, mm, ss, ms));
  }
}

export function recurrenceHorizonEndUtc(opts: {
  untilUtc: Date;
  recurrenceEndsAt: Date | null;
}) {
  const cap = opts.recurrenceEndsAt?.getTime();
  const until = opts.untilUtc.getTime();
  if (cap !== undefined && !Number.isNaN(cap)) {
    return new Date(Math.min(until, cap));
  }
  return opts.untilUtc;
}
