import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type AuditWriteInput = {
  correlationId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  payload?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Persist an immutable audit row. Intended for mutations and integration calls.
 */
export async function recordAudit(input: AuditWriteInput) {
  return prisma.auditLog.create({
    data: {
      correlationId: input.correlationId ?? undefined,
      actorUserId: input.actorUserId ?? undefined,
      action: input.action,
      resourceType: input.resourceType ?? undefined,
      resourceId: input.resourceId ?? undefined,
      payload: input.payload,
      metadata: input.metadata,
    },
  });
}
