import { randomUUID } from 'node:crypto'

import { db } from '#/db'
import { auditLogs } from '#/db/schema'
import { requestIp, requestUserAgent } from '../session'

export async function audit(input: {
  actorId?: string | null
  action: string
  targetType?: string
  targetId?: string
  meta?: Record<string, unknown>
}) {
  try {
    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metaJson: input.meta ? JSON.stringify(input.meta) : null,
      ip: requestIp(),
      userAgent: requestUserAgent(),
    })
  } catch (error) {
    // Auditing must never break the operation it describes.
    console.error('[asms] audit failed', error)
  }
}
