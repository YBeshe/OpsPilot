/** Webex (Cisco Webex) outbound notifications — uses Messages API. */

export type WebexMarkdownResult =
  | { ok: true; httpStatus: number; messageId?: string }
  | { ok: false; skippedReason: string; httpStatus?: number; detail?: string };

export async function sendWebexMarkdown(opts: {
  markdown: string;
  roomIdOverride?: string | null;
}): Promise<WebexMarkdownResult> {
  const token = process.env.WEBEX_BOT_TOKEN?.trim();
  const defaultRoom =
    process.env.WEBEX_NOTIFICATION_ROOM_ID?.trim()
    ?? process.env.WEBEX_ROOM_ID?.trim()
    ?? "";

  const roomId = opts.roomIdOverride?.trim() || defaultRoom;

  if (!token) {
    return { ok: false, skippedReason: "missing_bot_token" };
  }

  if (!roomId) {
    return { ok: false, skippedReason: "missing_room_id" };
  }

  const res = await fetch("https://webexapis.com/v1/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      roomId,
      markdown: sanitizeMarkdownEnvelope(opts.markdown),
    }),
    cache: "no-store",
  });

  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    bodyText = "";
  }

  if (!res.ok) {
    return {
      ok: false,
      skippedReason: "http_error",
      httpStatus: res.status,
      detail:
        bodyText.length > 0 ? bodyText.slice(0, 500) : `${res.status} ${res.statusText}`,
    };
  }

  let messageId: string | undefined;
  try {
    const json = JSON.parse(bodyText) as { id?: string };
    messageId = json.id;
  } catch {
    messageId = undefined;
  }

  return { ok: true, httpStatus: res.status, messageId };
}

function sanitizeMarkdownEnvelope(text: string) {
  const cleaned = text.replace(/\u0000/g, "");
  if (cleaned.length > 7439) {
    return `${cleaned.slice(0, 7400)}\n…`;
  }
  return cleaned;
}
