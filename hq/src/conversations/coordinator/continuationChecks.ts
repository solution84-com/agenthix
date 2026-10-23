/**
 * The checks a continuation passes before it may go on (conversation layer spec, Commissioning outside the place;
 * Authorised automatic continuation), re-run as the person who authorised it, as they stand now: they are still
 * active and may still speak in the conversation; and the boundary the work was done in admits them again by the
 * one admission rule work is started under (work/boundaries.ts) — a member there, the agent assigned there, the
 * tool not Never there. Any failure means a report turn instead, which starts no work.
 */
import { HttpError, prisma } from 'wasp/server'
import type { AdmitToBoundary, SharedBoundary } from '../contract'
import { requireConversationSpeaker } from '../readingRule'
import { admitToBoundary } from '../work/boundaries'
import { Logger } from '../../server/utils/logger'
import { ControlPlaneError } from '../../server/controlplane/types'
import type { ContinuationCheck } from './cardTurn'

const logger = new Logger('ConversationContinuation')

async function personActive(personId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: personId }, select: { deactivatedAt: true } })
  return row !== null && row.deactivatedAt === null
}

/** A continuation check over the conversation and the operation's own row; `admit` is the boundary's admission. */
export function continuationCheck(conversationId: string, agentId: string | null, admit: AdmitToBoundary = admitToBoundary): ContinuationCheck {
  return async (card) => {
    const personId = card.continuation.authorisedById
    try {
      if (!agentId || !(await personActive(personId))) return false
      await requireConversationSpeaker(conversationId, personId)
      const op = await prisma.operation.findUnique({
        where: { id: card.operationId },
        select: { toolName: true, boundaryType: true, boundaryId: true },
      })
      if (!op) return false
      if (!op.boundaryType || !op.boundaryId) return true
      const boundary: SharedBoundary = {
        key: op.boundaryId, type: op.boundaryType, id: op.boundaryId, name: await boundaryName(op.boundaryType, op.boundaryId),
      }
      const admitted = await admit({ personId, agentId, boundary, tool: op.toolName })
      if (!admitted.ok) logger.info(`continuation of operation ${card.operationId} refused: ${admitted.reason}`)
      return admitted.ok
    } catch (err) {
      // The reading rule refuses by throwing (they may no longer speak here), and so does a missing agent.
      if (err instanceof HttpError || err instanceof ControlPlaneError) return false
      throw err
    }
  }
}

/** A boundary's name in words: "your space", or the project's name. */
export async function boundaryName(type: 'user' | 'project', id: string): Promise<string> {
  if (type === 'user') return 'your space'
  const project = await prisma.project.findUnique({ where: { id }, select: { name: true, personalOwnerId: true, personalSpace: true } })
  if (!project) return 'a project'
  return project.personalOwnerId && project.personalSpace ? 'your space' : project.name
}
