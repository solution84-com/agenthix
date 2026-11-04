/**
 * What follows a proposal (workflows spec part 1, *A version's life*: Proposed → Reviewed): the reviewer reads the
 * version, then its card is written in the conversation it came from, carrying the reviewer's level beside the plain
 * checks' summary and flags. It runs on its own, after the proposal is answered; a failure is logged and leaves the
 * version waiting, to be approved from its page.
 */
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import type { WorkflowCheckFlag } from '@agenthix/core'
import { Logger } from '../../server/utils/logger'
import { cardDecision } from '../checks/card'
import { contentOf } from '../versionContent'
import { writeWorkflowCard, type CardTarget } from './card'
import { askReviewer, organisationReviewModel, type ReviewOutcome } from './reviewer'

const logger = new Logger('WorkflowReview')

export type AfterProposalDeps = {
  model: typeof organisationReviewModel
  writeCard: (t: CardTarget) => Promise<boolean>
}

const defaults: AfterProposalDeps = { model: organisationReviewModel, writeCard: writeWorkflowCard }

export function startReview(versionId: string): void {
  void reviewAndPresent(versionId).catch((err) => logger.error(`Could not review workflow version ${versionId}`, err))
}

/** At start: reviews the versions still waiting for one, which a stop of hq left unreviewed. */
export async function resumeReviews(): Promise<void> {
  const waiting = await prisma.workflowVersion.findMany({ where: { state: 'PROPOSED', reviewedAt: null }, select: { id: true } })
  for (const v of waiting) startReview(v.id)
}

export async function reviewAndPresent(versionId: string, deps: AfterProposalDeps = defaults): Promise<void> {
  const v = await prisma.workflowVersion.findUnique({
    where: { id: versionId },
    include: { files: true, workflow: { select: { name: true, placeType: true, placeId: true } } },
  })
  if (!v || v.state !== 'PROPOSED') return
  const approvedRow = await prisma.workflowVersion.findFirst({ where: { workflowId: v.workflowId, state: 'APPROVED' }, include: { files: true } })
  const content = contentOf(v)
  const approved = approvedRow ? { number: approvedRow.number, content: contentOf(approvedRow) } : null
  const flags = (Array.isArray(v.checkFlags) ? v.checkFlags : []) as unknown as WorkflowCheckFlag[]

  const store = async (o: ReviewOutcome, done: boolean) => {
    await prisma.workflowVersion.update({
      where: { id: versionId },
      data: { reviewLevel: o.level, reviewPoints: o.review as unknown as Prisma.InputJsonValue, reviewedAt: done ? new Date() : null },
    })
  }
  const outcome = await askReviewer({ number: v.number, content, approved, flags }, deps.model, (o) => store(o, false))
  await store(outcome, true)

  const decision = cardDecision(content, approved?.content ?? null, flags)
  // The reviewer takes minutes; a person may have decided, or a newer version replaced this one, meanwhile.
  const now = await prisma.workflowVersion.findUnique({ where: { id: versionId }, select: { state: true } })
  if (now?.state !== 'PROPOSED') return
  const agent = v.proposedByAgentId
    ? await prisma.agent.findUnique({ where: { id: v.proposedByAgentId }, select: { name: true } })
    : null
  await deps.writeCard({
    version: {
      id: v.id, number: v.number, hash: v.hash, workflowId: v.workflowId, workflowName: v.workflow.name,
      checkFlags: v.checkFlags, checkSummary: v.checkSummary, cardMayApprove: v.cardMayApprove,
      reviewLevel: outcome.level, reviewPoints: outcome.review as unknown as Prisma.JsonValue,
    },
    place: { type: v.workflow.placeType, id: v.workflow.placeId },
    proposedByRunId: v.proposedByRunId,
    proposedForUserId: v.proposedForUserId,
    agentName: agent?.name ?? null,
    reason: decision.mayApprove ? null : decision.reason,
  })
}
