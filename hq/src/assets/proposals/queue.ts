/**
 * The proposals around a level (spec part 5 *Proposing*; D27): aimed elsewhere by the person it was proposed for,
 * listed for the people who review that level, and rejected ones removed 90 days after their review (RQ5).
 */
import type { PrismaClient, ProposalAim } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { DAY_MS } from '../../conversations/archive/idle'
import { releaseContent } from '../content'
import { may } from '../policy'
import { personActor } from '../policyActors'
import { libraryTarget } from '../lifecycle/records'
import { placeOfProject } from '../places/place'
import { ProposalRefused } from './checks'
import { AIM_OF, yourSpaceOf } from './target'
import { REJECTED_KEPT_DAYS, type AimArg } from './types'

const NOTHING = 'Nothing was changed.'

/** The person a proposal was made for points it at another level, while it waits; a change to a skill stays with it. */
export async function aimProposal(db: PrismaClient, userId: string, input: { proposalId: unknown; aim: unknown }): Promise<{ aim: ProposalAim }> {
  const p = typeof input.proposalId === 'string' ? await db.proposal.findUnique({ where: { id: input.proposalId } }) : null
  if (!p || p.forUserId !== userId) throw new ProposalRefused(`That proposal isn't there, or wasn't made for you. ${NOTHING}`, 404)
  if (p.state !== 'OPEN') throw new ProposalRefused(`That proposal has already been reviewed. ${NOTHING}`, 409)
  if (p.assetId || p.placeSkillId) throw new ProposalRefused(`A change to a skill is reviewed where that skill is. ${NOTHING}`, 409)
  const aimArg = input.aim as AimArg
  if (!(aimArg in AIM_OF)) throw new ProposalRefused(`Aim it at the organisation, the project or yourself. ${NOTHING}`)
  let placeId: string | null = null
  if (aimArg === 'person') {
    if (!(await yourSpaceOf(db, userId))) throw new ProposalRefused(`You have no own space yet. ${NOTHING}`, 409)
    placeId = userId
  } else if (aimArg === 'project') {
    const conversation = p.conversationId ? await db.conversation.findUnique({ where: { id: p.conversationId }, select: { projectId: true } }) : null
    const member = conversation?.projectId
      ? await db.projectMember.findFirst({ where: { projectId: conversation.projectId, userId, role: { in: ['ADMIN', 'MEMBER'] } } })
      : null
    if (!conversation?.projectId || !member) throw new ProposalRefused(`This conversation's project is the only one it can be aimed at, and you work in none here. ${NOTHING}`, 409)
    placeId = conversation.projectId
  }
  try {
    const { count } = await db.proposal.updateMany({ where: { id: p.id, state: 'OPEN' }, data: { aim: AIM_OF[aimArg], placeId } })
    if (count === 0) throw new ProposalRefused(`That proposal has just been reviewed. ${NOTHING}`, 409)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ProposalRefused(`A proposal of ${p.name} already waits there. ${NOTHING}`, 409)
    }
    throw err
  }
  return { aim: AIM_OF[aimArg] }
}

export type ProposalListEntry = { id: string; name: string; description: string; edits: boolean; createdAt: string }

/** The open proposals at a level, for the people who review it: the Library's, a project's, or the person's own. */
export async function openProposals(db: PrismaClient, userId: string, input: { level: unknown; projectId?: unknown }): Promise<ProposalListEntry[]> {
  let where: { aim: ProposalAim; placeId: string | null }
  if (input.level === 'organisation') {
    if (!may(await personActor(userId, db), 'reviewProposal', await libraryTarget(db))) return []
    where = { aim: 'ORGANISATION', placeId: null }
  } else if (input.level === 'person') {
    where = { aim: 'PERSON', placeId: userId }
  } else {
    const ctx = await placeOfProject(db, input.projectId)
    if (!may(await personActor(userId, db, ctx.projectId), 'reviewProposal', ctx.target)) return []
    where = { aim: 'PROJECT', placeId: ctx.projectId }
  }
  const rows = await db.proposal.findMany({ where: { ...where, kind: 'SKILL', state: 'OPEN' }, orderBy: { createdAt: 'asc' }, take: 200 })
  return rows.map(r => ({ id: r.id, name: r.name, description: r.description, edits: r.assetId !== null || r.placeSkillId !== null, createdAt: r.createdAt.toISOString() }))
}

/** Rejected proposals reviewed more than 90 days ago go, their content released. */
export async function removeOldRejected(db: PrismaClient, now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - REJECTED_KEPT_DAYS * DAY_MS)
  const old = await db.proposal.findMany({ where: { state: 'REJECTED', reviewedAt: { lt: before } }, select: { id: true, digest: true }, take: 500 })
  if (old.length === 0) return 0
  await db.$transaction(async tx => {
    await tx.proposal.deleteMany({ where: { id: { in: old.map(o => o.id) } } })
    for (const digest of new Set(old.map(o => o.digest))) await releaseContent(digest, tx)
  })
  return old.length
}
