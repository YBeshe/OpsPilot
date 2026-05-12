export const runtime = "nodejs";

import { jsonOk } from "@/lib/api/envelope";
import { prisma } from "@/lib/db/prisma";
import { correlationFromHeaders } from "@/lib/http/correlation";
import { OUTLOOK_CREDENTIAL_ID } from "@/lib/integrations/constants";

export async function GET() {
  const correlationId = correlationFromHeaders();
  const row = await prisma.outlookCalendarCredential.findUnique({
    where: { id: OUTLOOK_CREDENTIAL_ID },
  });

  return jsonOk(
    {
      outlook: {
        connected: Boolean(row?.encryptedRefreshToken?.length ?? 0),
        userPrincipalName: row?.userPrincipalName ?? null,
        tenantId: row?.tenantIdUsed ?? null,
        scopes: row?.scope ?? null,
      },
      webex: {
        configured: Boolean(
          process.env.WEBEX_BOT_TOKEN?.trim()?.length &&
            (process.env.WEBEX_NOTIFICATION_ROOM_ID?.trim()?.length ??
              process.env.WEBEX_ROOM_ID?.trim()?.length ??
              0),
        ),
      },
    },
    correlationId,
  );
}
