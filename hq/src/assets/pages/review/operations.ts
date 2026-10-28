/** The review screens' reads as Wasp operations, hosted in `assets.wasp.ts`. Accepting and rejecting are 4d's own. */
import { HttpError, prisma } from 'wasp/server'
import { ProposalRefused } from '../../proposals/checks'
import { proposalReview, type ProposalReview } from './proposalReview'
import { proposalQueues, type QueueLevel } from './queues'

type Ctx = { user?: { id: string } | null }

export const getSkillProposalReview = async (args: unknown, context: Ctx): Promise<ProposalReview> => {
  if (!context.user) throw new HttpError(401)
  const a = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  try {
    return await proposalReview(prisma, context.user.id, a.proposalId)
  } catch (err) {
    if (err instanceof ProposalRefused) throw new HttpError(err.status, err.message)
    throw err
  }
}

export const getSkillProposalQueues = async (_args: unknown, context: Ctx): Promise<QueueLevel[]> => {
  if (!context.user) throw new HttpError(401)
  return proposalQueues(prisma, context.user.id)
}
