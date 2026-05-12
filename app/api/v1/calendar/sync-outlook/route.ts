export const runtime = "nodejs";

import { z } from "zod";

import { jsonErr, jsonOk } from "@/lib/api/envelope";
import { recordAudit } from "@/lib/audit";
import { correlationFromHeaders } from "@/lib/http/correlation";
import { prisma } from "@/lib/db/prisma";
import { OUTLOOK_CREDENTIAL_ID } from "@/lib/integrations/constants";
import { readMicrosoftOAuthEnv } from "@/lib/integrations/microsoft/config";
import { syncOutlookCalendarWindow } from "@/lib/integrations/microsoft/graph-calendar";

const BodySchema = z.object({
  horizonDays: z.coerce.number().int().min(7).max(365).optional(),
});

export async function POST(request: Request) {
  const correlationId = correlationFromHeaders();

  const oauthEnv = readMicrosoftOAuthEnv();
  if (!oauthEnv) {
    return jsonErr(
      "integrations_misconfigured",
      "Outlook integration environment variables are incomplete.",
      correlationId,
      503,
    );
  }

  const credential = await prisma.outlookCalendarCredential.findUnique({
    where: { id: OUTLOOK_CREDENTIAL_ID },
  });

  if (!credential?.encryptedRefreshToken) {
    return jsonErr(
      "precondition_failed",
      "Outlook is not connected for this OpsPilot tenant.",
      correlationId,
      409,
    );
  }

  let parsedBody: z.infer<typeof BodySchema> | null = null;
  try {
    const payload = await request.json();
    parsedBody = BodySchema.parse(payload);
  } catch {
    parsedBody = BodySchema.parse({});
  }

  const horizonDaysAhead = parsedBody.horizonDays ?? 180;

  try {
    const summary = await syncOutlookCalendarWindow({
      oauthEnv,
      horizonDaysAhead,
    });

    await recordAudit({
      correlationId,
      action: "calendar.outlook.synced",
      resourceType: "CalendarEvent",
      payload: summary,
    });

    return jsonOk(summary, correlationId);
  } catch (error) {
    await recordAudit({
      correlationId,
      action: "calendar.outlook.sync_failed",
      resourceType: "CalendarEvent",
      payload: {
        detail: error instanceof Error ? error.message : "unknown_error",
      },
    });

    return jsonErr(
      "outlook_sync_failed",
      error instanceof Error ? error.message : "Outlook sync failed.",
      correlationId,
      502,
    );
  }
}
