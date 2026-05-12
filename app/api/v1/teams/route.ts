export const runtime = "nodejs";

import { jsonOk } from "@/lib/api/envelope";
import { prisma } from "@/lib/db/prisma";
import { correlationFromHeaders } from "@/lib/http/correlation";

export async function GET() {
  const correlationId = correlationFromHeaders();

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  return jsonOk({ teams }, correlationId);
}
