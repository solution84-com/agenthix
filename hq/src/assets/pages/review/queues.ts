/**
 * The proposals waiting for review, by the level they aim at (spec part 5, D27; board R1): the organisation's, for its
 * administrators and Library maintainers; each project's, for its administrators; and the person's own. Each level
 * also lists what was decided there in the last 30 days. Only a level the person reviews is listed.
 */
import type { PrismaClient, Proposal } from '@prisma/client'
import { DAY_MS } from '../../../conversations/archive/idle'
import { may } from '../../policy'
import { personActor } from '../../policyActors'
import { libraryTarget } from '../../lifecycle/records'
import { agentName, personName } from '../../proposals/names'

export const DECIDED_DAYS = 30
const LIMIT = 100

export type QueueEntry = {
  id: string
  name: string
  description: string
  edits: boolean
  proposedBy: string | null
  proposedFor: string | null
  createdAt: string
  /** Decided entries: how, by whom, and when. */
  state: Proposal['state']
  reviewedBy: string | null
  reviewedAt: string | null
}

export type QueueLevel = {
  level: 'organisation' | 'project' | 'person'
  /** "The organisation's Library", a project's name, or "Your space". */
  label: string
  projectId: string | null
  open: QueueEntry[]
  decided: QueueEntry[]
}

async function entryOf(db: PrismaClient, p: Proposal): Promise<QueueEntry> {
  return {
    id: p.id, name: p.name, description: p.description, edits: p.assetId !== null || p.placeSkillId !== null,
    proposedBy: await agentName(db, p.agentId), proposedFor: await personName(db, p.forUserId), createdAt: p.createdAt.toISOString(),
    state: p.state, reviewedBy: await personName(db, p.reviewedById), reviewedAt: p.reviewedAt?.toISOString() ?? null,
  }
}

async function level(
  db: PrismaClient, head: Omit<QueueLevel, 'open' | 'decided'>, where: { aim: Proposal['aim']; placeId: string | null }, now: Date,
): Promise<QueueLevel> {
  const since = new Date(now.getTime() - DECIDED_DAYS * DAY_MS)
  const [open, decided] = await Promise.all([
    db.proposal.findMany({ where: { ...where, state: 'OPEN' }, orderBy: { createdAt: 'asc' }, take: LIMIT }),
    db.proposal.findMany({ where: { ...where, state: { not: 'OPEN' }, reviewedAt: { gte: since } }, orderBy: { reviewedAt: 'desc' }, take: LIMIT }),
  ])
  return { ...head, open: await Promise.all(open.map(p => entryOf(db, p))), decided: await Promise.all(decided.map(p => entryOf(db, p))) }
}

type Scope = { head: Omit<QueueLevel, 'open' | 'decided'>; where: { aim: Proposal['aim']; placeId: string | null } }

/** The levels this person reviews, with the proposals that aim at each: the one rule for what a person sees and counts. */
export async function reviewScopes(db: PrismaClient, userId: string): Promise<Scope[]> {
  const scopes: Scope[] = []
  const person = await personActor(userId, db)
  if (person.role === null) return scopes
  if (may(person, 'reviewProposal', await libraryTarget(db))) {
    scopes.push({ head: { level: 'organisation', label: "The organisation's Library", projectId: null }, where: { aim: 'ORGANISATION', placeId: null } })
  }
  const administered = await db.projectMember.findMany({
    where: { userId, role: 'ADMIN', project: { personalOwnerId: null } },
    select: { project: { select: { id: true, name: true } } },
  })
  for (const { project } of administered.sort((a, b) => a.project.name.localeCompare(b.project.name))) {
    scopes.push({ head: { level: 'project', label: project.name, projectId: project.id }, where: { aim: 'PROJECT', placeId: project.id } })
  }
  scopes.push({ head: { level: 'person', label: 'Your space', projectId: null }, where: { aim: 'PERSON', placeId: userId } })
  return scopes
}

export async function proposalQueues(db: PrismaClient, userId: string, now = new Date()): Promise<QueueLevel[]> {
  const scopes = await reviewScopes(db, userId)
  return Promise.all(scopes.map(s => level(db, s.head, s.where, now)))
}
