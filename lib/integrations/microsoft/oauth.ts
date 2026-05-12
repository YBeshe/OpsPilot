import { createHash, randomBytes } from "node:crypto";

import type { MicrosoftOAuthEnv } from "@/lib/integrations/microsoft/config";
import {
  authorizeEndpoint,
  OUTLOOK_OAUTH_SCOPE,
  tokenEndpoint,
} from "@/lib/integrations/microsoft/config";

function base64UrlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function generatePkcePair() {
  const codeVerifier = base64UrlEncode(randomBytes(64));
  const codeChallenge = base64UrlEncode(
    createHash("sha256").update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge };
}

export type AuthorizeRedirect = {
  url: string;
  state: string;
  codeVerifier: string;
};

export function buildAuthorizeRedirect(
  env: MicrosoftOAuthEnv,
): AuthorizeRedirect {
  const state = base64UrlEncode(randomBytes(32)).slice(0, 43);
  const { codeVerifier, codeChallenge } = generatePkcePair();

  const url = new URL(authorizeEndpoint(env.tenant));
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", env.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", OUTLOOK_OAUTH_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");

  return { url: url.toString(), state, codeVerifier };
}

export type TokenSuccess = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export async function exchangeAuthorizationCode(opts: {
  env: MicrosoftOAuthEnv;
  code: string;
  codeVerifier: string;
}): Promise<TokenSuccess> {
  const body = new URLSearchParams({
    client_id: opts.env.clientId,
    scope: OUTLOOK_OAUTH_SCOPE,
    code: opts.code,
    redirect_uri: opts.env.redirectUri,
    grant_type: "authorization_code",
    code_verifier: opts.codeVerifier,
  });
  if (opts.env.clientSecret) {
    body.set("client_secret", opts.env.clientSecret);
  }

  const res = await fetch(tokenEndpoint(opts.env.tenant), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenSuccess & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new Error(
      json.error_description ??
        json.error ??
        `Token exchange failed (${res.status})`,
    );
  }
  return json;
}

export async function refreshAccessToken(opts: {
  env: MicrosoftOAuthEnv;
  refreshToken: string;
  scopeFallback?: string | null | undefined;
}): Promise<TokenSuccess> {
  const body = new URLSearchParams({
    client_id: opts.env.clientId,
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    scope:
      opts.scopeFallback?.trim()?.length ?
        opts.scopeFallback.trim()
      : OUTLOOK_OAUTH_SCOPE,
  });
  if (opts.env.clientSecret) {
    body.set("client_secret", opts.env.clientSecret);
  }

  const res = await fetch(tokenEndpoint(opts.env.tenant), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenSuccess & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ??
        json.error ??
        `Refresh token exchange failed (${res.status})`,
    );
  }
  return json;
}
