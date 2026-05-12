import { headers } from "next/headers";

import { jsonOk } from "@/lib/api/envelope";
import { CORRELATION_HEADER, normalizeCorrelationId } from "@/lib/correlation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = headers();
  const correlationId = normalizeCorrelationId(h.get(CORRELATION_HEADER));

  let database: "ok" | "skipped" | "error" = "skipped";

  if (process.env.DATABASE_URL?.trim()) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "ok";
    } catch {
      database = "error";
    }
  }

  return jsonOk(
    {
      service: "opspilot",
      database,
      uptimeSeconds: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV ?? "development",
    },
    correlationId,
  );
}
