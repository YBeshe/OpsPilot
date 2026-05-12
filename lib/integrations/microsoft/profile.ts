export type GraphMeProfile = {
  id: string;
  userPrincipalName?: string | null;
  mail?: string | null;
  displayName?: string | null;
};

export async function readGraphSignedInUser(
  accessToken: string,
): Promise<GraphMeProfile | null> {
  const url = new URL("https://graph.microsoft.com/v1.0/me");
  url.searchParams.set(
    "$select",
    "id,userPrincipalName,mail,displayName",
  );
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      text.slice(0, 400) || `Unable to resolve Microsoft Graph profile (${res.status}).`,
    );
  }

  const json = (await res.json()) as GraphMeProfile;
  return json?.id ? json : null;
}
