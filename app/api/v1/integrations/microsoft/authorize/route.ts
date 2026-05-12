export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { correlationFromHeaders } from "@/lib/http/correlation";
import { readMicrosoftOAuthEnv } from "@/lib/integrations/microsoft/config";
import { buildAuthorizeRedirect } from "@/lib/integrations/microsoft/oauth";
import { jsonErr } from "@/lib/api/envelope";

export async function GET() {
  const correlationId = correlationFromHeaders();

  const oauthEnv = readMicrosoftOAuthEnv();
  if (!oauthEnv) {
    return jsonErr(
      "integrations_misconfigured",
      "Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID, APP_BASE_URL (or MICROSOFT_REDIRECT_URI), and MICROSOFT_TENANT_ID.",
      correlationId,
      503,
    );
  }

  try {
    await prisma.oAuthPkceState.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 15 * 60 * 1000),
        },
      },
    });

    const redirectPayload = buildAuthorizeRedirect(oauthEnv);
    await prisma.oAuthPkceState.create({
      data: {
        state: redirectPayload.state,
        codeVerifier: redirectPayload.codeVerifier,
      },
    });

    return NextResponse.redirect(redirectPayload.url);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to initiate Microsoft OAuth.";
    return jsonErr("oauth_start_failed", message, correlationId, 500);
  }
}
