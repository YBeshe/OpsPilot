export const runtime = "nodejs";

import type { NextRequest } from "next/server";

import { jsonErr, jsonOk } from "@/lib/api/envelope";
import { authorizationBearer, timingSafeBearerMatch } from "@/lib/calendar/cron-auth";
import { expandAllSeries } from "@/lib/calendar/event-materialize";
import { materializationHorizonUtc } from "@/lib/calendar/materialization-horizon";
import { correlationFromHeaders } from "@/lib/http/correlation";

export async function POST(request: NextRequest) {
  const correlationId = correlationFromHeaders();

  const secret =
    typeof process.env.OPS_CRON_SECRET === "string" ?
      process.env.OPS_CRON_SECRET
    : "";

  const token = authorizationBearer(request);
  if (!timingSafeBearerMatch(token, secret)) {
    return jsonErr("forbidden", "Invalid or missing scheduler credential.", correlationId, 403);
  }

  const untilUtc = materializationHorizonUtc();
  const outcome = await expandAllSeries(untilUtc);

  return jsonOk(
    {
      horizonUntilUtc: untilUtc.toISOString(),
      seriesTouched: outcome.seriesTouched,
      occurrencesCreated: outcome.occurrencesCreated,
    },
    correlationId,
  );
}
