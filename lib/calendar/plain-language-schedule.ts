import type { SeriesRecurrence } from "@prisma/client";
import * as chrono from "chrono-node";

export type TeamLexicon = Pick<
  import("@prisma/client").Team,
  "id" | "name" | "slug"
>;

export type PlainLanguageInterpretation = {
  title: string;
  startsAt: Date;
  endsAt: Date;
  recurrence?: SeriesRecurrence;
  recurrenceEndsAt: Date | null;
  notifyWebex: boolean;
  teamIdHint?: string;
};

export type InterpretResult =
  | { ok: true; value: PlainLanguageInterpretation }
  | { ok: false; message: string };

const RECURRENCE_RULES: { pattern: RegExp; value: SeriesRecurrence }[] = [
  { pattern: /\b(?:every\s+two\s+weeks|bi[-\s]?weekly|every\s+other\s+week)\b/gi, value: "BIWEEKLY" },
  {
    pattern: /\b(?:every\s+week|weekly|once\s+a\s+week|each\s+week)\b/gi,
    value: "WEEKLY",
  },
  { pattern: /\b(?:every\s+day|daily)\b/gi, value: "DAILY" },
  { pattern: /\b(?:every\s+month|monthly)\b/gi, value: "MONTHLY" },
  { pattern: /\b(?:every\s+quarter|quarterly)\b/gi, value: "QUARTERLY" },
];

/** Pull “until …” / “through …” into a recurrence end anchor for chrono */
const UNTIL_PREFIX = /\b(?:until|through|til|till)\s+/i;

const DURATION = /\b(?:for|lasting)\s+(\d+)\s*(hours?|hrs?|h)(?:\b|\.)?|\b(?:for|lasting)\s+(\d+)\s*(minutes?|mins?|m)(?:\b|\.)?/i;

const NOTIFY_ONCE = /\bwebex\b|\bnotify\b(?:\s+(?:the\s+)?room\b)?|\bping\s+(?:the\s+)?room\b/i;

const LEADING_VERBS = /^(?:please\s+)?(?:schedule|book|create|add|set\s+up)\s*[:\-,]?\s+/i;

/**
 * Parses a short natural-language scheduling line into concrete calendar fields.
 * Used as a companion to structured forms — keep copy short and factual.
 */
export function interpretPlainLanguageEvent(
  raw: string,
  ctx: {
    instant: Date;
    timeZone: string;
    teams: TeamLexicon[];
  },
): InterpretResult {
  const input = raw.trim().slice(0, 4000);
  if (!input) return { ok: false, message: "Plain-language schedule text is empty." };

  const refClock = { instant: ctx.instant, timezone: ctx.timeZone };

  let remaining = input;
  const notifyWebex = NOTIFY_ONCE.test(input);
  if (notifyWebex) {
    remaining = remaining.replace(NOTIFY_ONCE, " ");
  }

  let recurrence: SeriesRecurrence | undefined;
  for (const { pattern, value } of RECURRENCE_RULES) {
    if (pattern.test(remaining)) {
      recurrence = value;
      pattern.lastIndex = 0;
      remaining = remaining.replace(pattern, " ");
      break;
    }
    pattern.lastIndex = 0;
  }

  let recurrenceEndsAt: Date | null = null;
  if (recurrence) {
    const untilMatch = remaining.match(UNTIL_PREFIX);
    if (untilMatch && untilMatch.index !== undefined) {
      const trailing = remaining.slice(untilMatch.index + untilMatch[0].length).trim();
      if (trailing.length > 0) {
        const parsedUntil = chrono.casual.parseDate(trailing, refClock, {
          forwardDate: true,
        });
        if (parsedUntil) {
          recurrenceEndsAt = parsedUntil;
          remaining = remaining.slice(0, untilMatch.index).trim();
        }
      }
    }
  }

  let extraDurationMin = 0;
  const durMatch = remaining.match(DURATION);
  if (durMatch) {
    if (durMatch[1]) {
      extraDurationMin = Number.parseInt(durMatch[1], 10) * 60;
    } else if (durMatch[3]) {
      extraDurationMin = Number.parseInt(durMatch[3], 10);
    }
    if (!Number.isFinite(extraDurationMin) || extraDurationMin < 0) {
      extraDurationMin = 0;
    }
    remaining = remaining.replace(DURATION, " ");
  }

  const teamSorted = [...ctx.teams].sort(
    (a, b) => b.name.length - a.name.length,
  );
  let teamIdHint: string | undefined;
  const loweredRemain = remaining.toLowerCase();
  for (const t of teamSorted) {
    const asName = t.name.toLowerCase();
    const asSlug = t.slug.replace(/-/g, " ").toLowerCase();
    if (loweredRemain.includes(asName)) {
      teamIdHint = t.id;
      const esc = escapeRegExp(asName);
      remaining = remaining.replace(new RegExp(esc, "gi"), " ");
      break;
    }
    if (asSlug.length >= 3 && loweredRemain.includes(asSlug)) {
      teamIdHint = t.id;
      remaining = remaining.replace(new RegExp(escapeRegExp(asSlug), "gi"), " ");
      break;
    }
  }

  remaining = collapseWhitespace(remaining);

  const results = chrono.casual.parse(remaining, refClock, {
    forwardDate: true,
  });
  results.sort((a, b) => a.index - b.index);
  const first = results.find((r) => r.start);
  if (!first) {
    return {
      ok: false,
      message:
        'Could not find a date/time in your text. Include something like "tomorrow at 15:30" after describing the meeting.',
    };
  }

  const startsAt = first.start.date();
  let endsAt: Date;
  if (first.end) {
    endsAt = first.end.date();
    if (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      endsAt = new Date(
        startsAt.getTime()
          + (extraDurationMin > 0 ? extraDurationMin : 60) * 60_000,
      );
    }
  } else {
    const mins = extraDurationMin > 0 ? extraDurationMin : 60;
    endsAt = new Date(startsAt.getTime() + mins * 60_000);
  }

  let titlePieces = remaining;
  for (const r of [...results].sort((a, b) => b.index - a.index)) {
    titlePieces =
      titlePieces.slice(0, r.index).trimEnd()
      + " "
      + titlePieces.slice(r.index + r.text.length).trimStart();
  }
  titlePieces = collapseWhitespace(titlePieces.replace(LEADING_VERBS, "").trim());

  let title =
    titlePieces.length >= 3 ? sliceTitle(titlePieces) : "Scheduled event";

  return {
    ok: true,
    value: {
      title,
      startsAt,
      endsAt,
      recurrence,
      recurrenceEndsAt,
      notifyWebex,
      teamIdHint,
    },
  };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collapseWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function sliceTitle(s: string) {
  return s.slice(0, 500);
}
