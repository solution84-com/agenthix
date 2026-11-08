/**
 * Reviewing a proposed task template (spec D16; the skills' rule, adr-0159): a Library maintainer or an administrator
 * publishes it as version 1.0.0, or rejects it with a note. Only the reviewers and the person it was proposed by see it.
 * The reviewer names the content they looked at; accepting publishes and settles the proposal in one transaction, so two
 * reviewers at once publish it once.
 */
import { prisma } from 'wasp/server'
import { formatAssetIdentity, type TaskTemplateContent } from '@agenthix/core'
import { readContent } from '../../assets/content'
import { may } from '../../assets/policy'
import { organisationTarget, personActor } from '../../assets/policyActors'
import { organisationPublisher } from '../../assets/organisationPublisher'
import { personName } from '../../assets/proposals/names'
import { titleOfName } from '../assetList/words'
import { TaskTemplateRefused, readTemplatePackage } from './templateContent'
import { publishFirstVersion } from './templatePublish'

const NOTHING = 'Nothing was changed.'
const NOT_HERE = "That isn't there, or isn't yours to see."
const NOTE_MAX = 1000

export type TaskTemplateProposalView = {
  id: string
  title: string
  /** Where it goes in the Library when published: `publisher/name`. */
  identity: string
  description: string
  holds: TaskTemplateContent
  digest: string
  state: 'OPEN' | 'ACCEPTED' | 'ACCEPTED_WITH_CHANGES' | 'REJECTED'
  proposedBy: string | null
  createdAt: string
  reviewedBy: string | null
  reviewNote: string | null
  /** The Library's page of what it became, once published. */
  publishedAssetId: string | null
  mayReview: boolean
}

async function mayReview(userId: string): Promise<boolean> {
  return may(await personActor(userId, prisma), 'reviewProposal', await organisationTarget(prisma))
}

async function proposalOf(proposalId: unknown) {
  const p = typeof proposalId === 'string' ? await prisma.proposal.findUnique({ where: { id: proposalId } }) : null
  if (!p || p.kind !== 'TASK_TEMPLATE') throw new TaskTemplateRefused(NOT_HERE, 404)
  return p
}

export async function viewTaskTemplateProposal(userId: string, proposalId: unknown): Promise<TaskTemplateProposalView> {
  const p = await proposalOf(proposalId)
  const reviewer = await mayReview(userId)
  if (!reviewer && p.forUserId !== userId) throw new TaskTemplateRefused(NOT_HERE, 404)
  const { content } = readTemplatePackage(await readContent(p.digest, prisma))
  const published = p.resultVersionId
    ? await prisma.assetVersion.findUnique({ where: { id: p.resultVersionId }, select: { assetId: true } })
    : null
  return {
    id: p.id, title: titleOfName(p.name), identity: formatAssetIdentity({ publisher: await organisationPublisher(prisma), name: p.name }),
    description: p.description, holds: content, digest: p.digest, state: p.state,
    proposedBy: await personName(prisma, p.forUserId), createdAt: p.createdAt.toISOString(),
    reviewedBy: await personName(prisma, p.reviewedById), reviewNote: p.reviewNote,
    publishedAssetId: published?.assetId ?? null, mayReview: reviewer && p.state === 'OPEN',
  }
}

async function reviewing(userId: string, proposalId: unknown, digest: unknown) {
  const p = await proposalOf(proposalId)
  if (!(await mayReview(userId))) throw new TaskTemplateRefused(`Reviewing is for administrators and Library maintainers. ${NOTHING}`, 403)
  if (p.state !== 'OPEN') throw new TaskTemplateRefused(`That proposal has already been reviewed. ${NOTHING}`, 409)
  if (digest !== p.digest) throw new TaskTemplateRefused(`The proposal changed since you looked at it. Look at it again. ${NOTHING}`, 409)
  return p
}

const raced = (): never => { throw new TaskTemplateRefused(`Someone reviewed this proposal at the same moment. ${NOTHING}`, 409) }

export async function acceptTaskTemplateProposal(userId: string, input: { proposalId: unknown; digest: unknown }) {
  const p = await reviewing(userId, input.proposalId, input.digest)
  const files = await readContent(p.digest, prisma)
  readTemplatePackage(files)
  const publisher = await organisationPublisher(prisma)
  const by = await personName(prisma, p.forUserId)
  return prisma.$transaction(async tx => {
    const out = await publishFirstVersion(tx, { publisher, name: p.name, files, byId: userId, note: `Proposed by ${by ?? 'a member'}` })
    const { count } = await tx.proposal.updateMany({
      where: { id: p.id, state: 'OPEN' },
      data: { state: 'ACCEPTED', reviewedById: userId, reviewedAt: new Date(), resultVersionId: out.versionId },
    })
    if (count === 0) raced()
    return out
  })
}

export async function rejectTaskTemplateProposal(userId: string, input: { proposalId: unknown; digest: unknown; note: unknown }): Promise<{ state: 'REJECTED' }> {
  const p = await reviewing(userId, input.proposalId, input.digest)
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, NOTE_MAX) : ''
  if (!note) throw new TaskTemplateRefused(`Say why it isn't published; the person who proposed it reads it. ${NOTHING}`)
  const { count } = await prisma.proposal.updateMany({
    where: { id: p.id, state: 'OPEN' },
    data: { state: 'REJECTED', reviewedById: userId, reviewedAt: new Date(), reviewNote: note },
  })
  if (count === 0) raced()
  return { state: 'REJECTED' }
}
