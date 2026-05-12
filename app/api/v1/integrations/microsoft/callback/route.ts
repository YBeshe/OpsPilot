export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit";
import { sealSecret } from "@/lib/crypto/integration-token";
import { prisma } from "@/lib/db/prisma";
import { correlationFromHeaders } from "@/lib/http/correlation";
import { OUTLOOK_CREDENTIAL_ID } from "@/lib/integrations/constants";
import { readMicrosoftOAuthEnv } from "@/lib/integrations/microsoft/config";
import { exchangeAuthorizationCode } from "@/lib/integrations/microsoft/oauth";
import { readGraphSignedInUser } from "@/lib/integrations/microsoft/profile";

function redirectDashboard(query: Record<string, string>) {
  const params = new URLSearchParams(query);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return NextResponse.redirect(`/dashboard/calendar${suffix}`);
}

export async function GET(request: NextRequest) {
  const correlationId = correlationFromHeaders();

  const params = request.nextUrl.searchParams;
  const microsoftError =
    params.get("error_description") ?? params.get("error");
  if (microsoftError) {
    return redirectDashboard({
      outlook: "error",
      reason: microsoftError.slice(0, 180),
    });
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return redirectDashboard({
      outlook: "error",
      reason: "missing_oauth_payload",
    });
  }

  const oauthEnv = readMicrosoftOAuthEnv();
  if (!oauthEnv) {
    return redirectDashboard({
      outlook: "error",
      reason: "missing_entra_env",
    });
  }

  const pending = await prisma.oAuthPkceState.findUnique({
    where: { state },
  });

  if (!pending) {
    return redirectDashboard({ outlook: "error", reason: "unknown_state" });
  }

  await prisma.oAuthPkceState.delete({
    where: { state },
  });

  try {
    const exchanged = await exchangeAuthorizationCode({
      env: oauthEnv,
      code,
      codeVerifier: pending.codeVerifier,
    });

    if (!exchanged.refresh_token) {
      return redirectDashboard({
        outlook: "error",
        reason: "missing_refresh_token",
      });
    }

    const refreshedScope = exchanged.scope ?? "";
    const sealedRefresh = sealSecret(exchanged.refresh_token);

    let profilePrincipal: string | null = null;
    let azureId: string | null = null;
    try {
      if (exchanged.access_token) {
        const profile = await readGraphSignedInUser(exchanged.access_token);
        if (profile) {
          azureId = profile.id;
          profilePrincipal =
            profile.userPrincipalName
            ?? profile.mail
            ?? profile.displayName
            ?? null;
        }
      }
    } catch {
      profilePrincipal = null;
      azureId = null;
    }

    await prisma.outlookCalendarCredential.upsert({
      where: { id: OUTLOOK_CREDENTIAL_ID },
      create: {
        id: OUTLOOK_CREDENTIAL_ID,
        encryptedRefreshToken: sealedRefresh,
        scope: refreshedScope,
        tenantIdUsed: oauthEnv.tenant,
        azureAdUserObjectId: azureId,
        userPrincipalName: profilePrincipal,
      },
      update: {
        encryptedRefreshToken: sealedRefresh,
        scope: refreshedScope.length > 0 ? refreshedScope : undefined,
        tenantIdUsed: oauthEnv.tenant,
        azureAdUserObjectId: azureId ?? undefined,
        userPrincipalName: profilePrincipal ?? undefined,
      },
    });

    await recordAudit({
      correlationId,
      action: "integration.outlook.connected",
      resourceType: "OutlookCalendarCredential",
      resourceId: OUTLOOK_CREDENTIAL_ID,
      payload: {
        tenant: oauthEnv.tenant,
        principal: profilePrincipal,
      },
    });

    return redirectDashboard({ outlook: "connected" });
  } catch (error) {
    const message =
      error instanceof Error ?
        `${error.message}`.slice(0, 200)
      : "token_exchange_failed";

    await recordAudit({
      correlationId,
      action: "integration.outlook.oauth_failed",
      resourceType: "OutlookCalendarCredential",
      resourceId: OUTLOOK_CREDENTIAL_ID,
      payload: {
        detail: message,
      },
    });

    return redirectDashboard({ outlook: "error", reason: message });
  }
}
