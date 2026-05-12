import type { SeriesRecurrence } from "@prisma/client";
import type { ParsedResult } from "chrono-node";
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

const UNTIL_PREFIX = /\b(?:until|through|til|till)\s+/i;

const DURATION =
  /\b(?:for|lasting)\s+(\d+)\s*(hours?|hrs?|h)(?:\b|\.)?|\b(?:for|lasting)\s+(\d+)\s*(minutes?|mins?|m)(?:\b|\.)?/i;

const NOTIFY_ONCE =
  /\bwebex\b|\bnotify\b(?:\s+(?:the\s+)?room\b)?|\bping\s+(?:the\s+)?room\b/i;

const LEADING_VERBS =
  /^(?:please\s+)?(?:schedule|book|create|add|set\s+up)\s*[:\-,]?\s+/i;

function pickBestChronoMatch(results: ParsedResult[]): ParsedResult | undefined {
  const withStart = results.filter((r) => r.start);
  if (withStart.length === 0) return undefined;

  const rank = (r: ParsedResult) =>
    Number(r.start!.isCertain("year")) * 16
    + Number(r.start!.isCertain("month")) * 8
    + Number(r.start!.isCertain("day")) * 8
    + Number(r.start!.isCertain("hour")) * 4
    + Number(r.start!.isCertain("minute")) * 2
    + Number(r.start!.isCertain("second"));

  withStart.sort((a, b) => {
    const delta = rank(b) - rank(a);
    return delta !== 0 ? delta : a.index - b.index;
  });
  return withStart[0];
}

function uniqueCandidateStrings(...raw: string[]): string[] {
  const cleaned = raw
    .map((s) => collapseWhitespace(s))
    .filter((s) => s.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of cleaned) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * Parses a plain-language scheduling line. Date/time extraction uses chrono
 * before stripping team/org names so labels never hide times from the parser.
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
  const afterNotify = collapseWhitespace(remaining);

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

  remaining = collapseWhitespace(remaining);

  let chronologySource = "";
  let chronoHits: ParsedResult[] = [];

  const candidates = uniqueCandidateStrings(remaining, afterNotify, input);
  for (const cand of candidates) {
    const hits = chrono.casual.parse(cand, refClock, { forwardDate: true });
    if (hits.some((h) => h.start)) {
      chronologySource = cand;
      chronoHits = hits;
      break;
    }
  }

  const best = pickBestChronoMatch(chronoHits);
  if (!best) {
    return {
      ok: false,
      message:
        'Could not find a date/time in your text. Mention a clear slot (e.g. "tomorrow at 15:30", "May 22 2026 9am", "next Tuesday 3pm") in addition to titles or team names.',
    };
  }

  const startsAt = best.start!.date();

  let endsAt: Date;
  if (best.end) {
    endsAt = best.end.date();
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

  let titlePieces = chronologySource;
  for (const r of [...chronoHits].sort((a, b) => b.index - a.index)) {
    titlePieces =
      titlePieces.slice(0, r.index).trimEnd()
      + " "
      + titlePieces.slice(r.index + r.text.length).trimStart();
  }
  titlePieces = collapseWhitespace(titlePieces);

  const teamSorted = [...ctx.teams].sort(
    (a, b) => b.name.length - a.name.length,
  );
  let teamIdHint: string | undefined;
  const loweredTitle = titlePieces.toLowerCase();

  for (const t of teamSorted) {
    const asName = t.name.toLowerCase();
    if (loweredTitle.includes(asName)) {
      teamIdHint = t.id;
      const esc = escapeRegExp(asName);
      titlePieces = titlePieces.replace(new RegExp(esc, "gi"), " ");
      break;
    }
    const asSlug = t.slug.replace(/-/g, " ").toLowerCase();
    if (asSlug.length >= 3 && loweredTitle.includes(asSlug)) {
      teamIdHint = t.id;
      titlePieces = titlePieces.replace(new RegExp(escapeRegExp(asSlug), "gi"), " ");
      break;
    }
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
