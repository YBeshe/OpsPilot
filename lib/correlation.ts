/** Header used across edge middleware, route handlers, and audit rows. */
export const CORRELATION_HEADER = "x-correlation-id" as const;

export function normalizeCorrelationId(
  incoming: string | null | undefined,
): string {
  const v = incoming?.trim();
  if (v && v.length <= 128 && /^[\w.-]+$/.test(v)) return v;
  return crypto.randomUUID();
}
