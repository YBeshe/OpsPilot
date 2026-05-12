import { timingSafeEqual } from "crypto";

export function authorizationBearer(request: Request) {
  const raw = request.headers.get("authorization");
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() ?? null;
}

/**
 * Length-safe compare for Bearer tokens. Returns false without leaking which side mismatched beyond length equality.
 */
export function timingSafeBearerMatch(provided: string | null, expected: string) {
  if (!provided || expected.length < 16) return false;
  try {
    const left = Buffer.from(provided, "utf8");
    const right = Buffer.from(expected, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
