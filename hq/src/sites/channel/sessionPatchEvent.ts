/**
 * Intake for `session.patch` (core's SessionPatchEvent): a site closing a
 * conversation when a membership ended, with no run frame to carry the change
 * (person-scoped execution spec §4). Only what such a close changes is
 * accepted — the CLOSED status and a known reason — and only for a session the
 * sending site owns, the same ownership rule `run.status` applies. A session
 * hq no longer has (its person was removed) is nothing to update.
 */
import { SESSION_CLOSED_REASONS, type SessionClosedReasonValue } from '@agenthix/core'
import { prisma } from 'wasp/server'
import { Logger } from '../../server/utils/logger'
import { sessionOwnedBy } from './sessionOwnerSite'

const logger = new Logger('SiteEvents')

function parse(data: unknown): { sessionId: string; closedReason: SessionClosedReasonValue } | null {
  const e = data as { sessionId?: unknown; sessionPatch?: { status?: unknown; closedReason?: unknown } } | null
  if (typeof e?.sessionId !== 'string' || e.sessionId.length === 0) return null
  const patch = e.sessionPatch
  if (patch?.status !== 'CLOSED') return null
  const reason = patch.closedReason
  if (typeof reason !== 'string' || !(SESSION_CLOSED_REASONS as readonly string[]).includes(reason)) return null
  return { sessionId: e.sessionId, closedReason: reason as SessionClosedReasonValue }
}

export async function handleSessionPatch(siteId: string, data: unknown): Promise<void> {
  const patch = parse(data)
  if (!patch) {
    logger.warn(`malformed session.patch from ${siteId} — dropped`)
    return
  }
  if (!(await sessionOwnedBy(patch.sessionId, siteId))) return
  await prisma.agentSession.updateMany({
    where: { id: patch.sessionId },
    data: { status: 'CLOSED', closedReason: patch.closedReason },
  })
}
