/** Microsoft Entra OAuth + Microsoft Graph URLs (Outlook calendar). */

export const OUTLOOK_OAUTH_SCOPE =
  "offline_access openid profile email User.Read Calendars.Read Calendars.ReadWrite";

export type MicrosoftOAuthEnv = {
  clientId: string;
  /** Required for confidential client token exchange */
  clientSecret: string | null;
  tenant: string;
  redirectUri: string;
};

export function readMicrosoftOAuthEnv(): MicrosoftOAuthEnv | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  if (!clientId) return null;
  const tenant = process.env.MICROSOFT_TENANT_ID?.trim() || "common";
  const clientSecretRaw = process.env.MICROSOFT_CLIENT_SECRET;
  const clientSecret =
    typeof clientSecretRaw === "string" && clientSecretRaw.trim().length > 0
      ? clientSecretRaw.trim()
      : null;

  const explicitRedirect = process.env.MICROSOFT_REDIRECT_URI?.trim();
  const base = process.env.APP_BASE_URL?.trim()?.replace(/\/$/, "") ?? "";
  const redirectUri =
    explicitRedirect && explicitRedirect.length > 0
      ? explicitRedirect
      : `${base}/api/v1/integrations/microsoft/callback`;

  if (!redirectUri.startsWith("http")) {
    throw new Error(
      "Configure APP_BASE_URL or MICROSOFT_REDIRECT_URI with a fully qualified HTTPS/HTTP redirect URL registered in Entra.",
    );
  }

  return { clientId, clientSecret, tenant, redirectUri };
}

export function authorizeEndpoint(tenant: string) {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
}

export function tokenEndpoint(tenant: string) {
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}
