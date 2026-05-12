/** Read correlation id propagated by middleware (always present unless routes bypass middleware). */

import { headers } from "next/headers";

import { CORRELATION_HEADER, normalizeCorrelationId } from "@/lib/correlation";

export function correlationFromHeaders(): string {
  return normalizeCorrelationId(headers().get(CORRELATION_HEADER));
}
