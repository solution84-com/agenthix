/**
 * A proposal and a draft change as the card and the review read them (board C3): what it is, for which level, who
 * proposed it and for whom, who reviews it, its outcome, its files and what it changes. Only the person it was
 * proposed for and the people who may review it see a proposal; only people who may edit a draft see it (security
 * review M6's rule: access is checked when it is looked at).
 */
import type { PrismaClient, Proposal } from '@prisma/client'
import type { Db } from '../../packages/packageStore'
import { readContent } from '../content'
import { may, type PersonActor } from '../policy'
import { personActor } from '../policyActors'
import { fileChanges, type FileChanges } from '../lifecycle/versions'
import { libraryTarget, identityOf } from '../lifecycle/records'
import { placeOfSkill, type PlaceContext } from '../places/place'
import { newestVersion, skillNameOf } from '../places/placeDrafts'
import { organisationPublisher } from '../organisationPublisher'
import { ProposalRefused } from './checks'
import { agentName, personName } from './names'
import { placeOfProposal, reviewersOf } from './target'

const NOTHING_HERE = 'That isn\'t there, or isn\'t yours to see.'

export type SkillFileView = { path: string; text: string | null }

export type SkillProposalView = {
  id: string
  name: string
  description: string
  why: string
  aim: 'ORGANISATION' | 'PROJECT' | 'PERSON'
  placeName: string | null
  edits: string | null
  /** Accepting makes the organisation's own copy of a skill another publisher signed (D18). */
  makesCopy: boolean
  state: 'OPEN' | 'ACCEPTED' | 'ACCEPTED_WITH_CHANGES' | 'REJECTED'
  digest: string
  proposedBy: string | null
  proposedFor: string | null
  reviewers: string
  reviewedBy: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  files: SkillFileView[]
  /** From what the edited skill holds now, for a change; every file. */
  changes: FileChanges | null
  mayReview: boolean
  mayAim: boolean
  /** Where else the person may aim it: their own space always, the organisation, and the conversation's project. */
  aims: ('organisation' | 'project' | 'person')[]
}

const asText = (b: Buffer) => { const t = b.toString('utf-8'); return t.includes('�') ? null : t }

export async function viewProposal(db: PrismaClient, viewerId: string, proposalId: unknown): Promise<SkillProposalView> {
  const p = typeof proposalId === 'string' ? await db.proposal.findUnique({ where: { id: proposalId } }) : null
  if (!p) throw new ProposalRefused(NOTHING_HERE, 404)
  const ctx = await placeOfProposal(db, p)
  const viewer = await personActor(viewerId, db, ctx?.target.level === 'project' ? ctx.target.projectId : undefined)
  const mayReview = may(viewer, 'reviewProposal', ctx ? ctx.target : await libraryTarget(db))
  if (!mayReview && p.forUserId !== viewerId) throw new ProposalRefused(NOTHING_HERE, 404)
  const files = await readContent(p.digest, db)
  const { edits, makesCopy, current } = await editedOf(db, p)
  const open = p.state === 'OPEN'
  return {
    id: p.id, name: p.name, description: p.description, why: p.why, aim: p.aim,
    placeName: ctx ? await placeName(db, ctx) : null, edits, makesCopy, state: p.state, digest: p.digest,
    proposedBy: await agentName(db, p.agentId), proposedFor: await personName(db, p.forUserId),
    reviewers: await reviewersOf(db, p), reviewedBy: await personName(db, p.reviewedById), reviewNote: p.reviewNote,
    reviewedAt: p.reviewedAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(),
    files: files.map(f => ({ path: f.path, text: asText(f.content) })),
    changes: current ? fileChanges(current, files) : null,
    mayReview: open && mayReview,
    mayAim: open && p.forUserId === viewerId && !edits,
    aims: open && p.forUserId === viewerId && !edits ? await aimsFor(db, p) : [],
  }
}

async function placeName(db: Db, ctx: PlaceContext): Promise<string> {
  if (ctx.target.level === 'person') return 'Your space'
  return (await db.project.findUnique({ where: { id: ctx.projectId }, select: { name: true } }))?.name ?? 'the project'
}

async function editedOf(db: Db, p: Proposal) {
  if (p.assetId) {
    const asset = await db.asset.findUnique({ where: { id: p.assetId }, include: { currentVersion: true } })
    if (!asset) return { edits: null, makesCopy: false, current: null }
    const own = await organisationPublisher(db)
    const current = asset.currentVersion ? (await readContent(asset.currentVersion.digest, db)).filter(f => f.path !== 'package.json') : null
    return { edits: `${identityOf(asset)}${asset.currentVersion ? ` ${asset.currentVersion.version}` : ''}`, makesCopy: asset.publisher !== own, current }
  }
  if (p.placeSkillId) {
    const skill = await db.placeSkill.findUnique({ where: { id: p.placeSkillId } })
    if (!skill) return { edits: null, makesCopy: false, current: null }
    const newest = await newestVersion(db, skill.id)
    return { edits: skillNameOf(skill), makesCopy: false, current: newest ? await readContent(newest.digest, db) : null }
  }
  return { edits: null, makesCopy: false, current: null }
}

async function aimsFor(db: Db, p: Proposal): Promise<SkillProposalView['aims']> {
  const aims: SkillProposalView['aims'] = ['organisation', 'person']
  const conversation = p.conversationId ? await db.conversation.findUnique({ where: { id: p.conversationId }, select: { projectId: true } }) : null
  if (conversation?.projectId) aims.splice(1, 0, 'project')
  return aims
}

export type SkillDraftCardView = {
  name: string
  /** The draft's newest revision, or null once it was published or discarded. */
  revision: number | null
  /** The newest published version, as people read it. */
  published: string | null
  mayPublish: boolean
  /** Where the draft is opened: the Library, or the place's project. */
  openHref: string
}

/** A draft change's card: only for people who may edit that draft. */
export async function viewDraftCard(db: PrismaClient, viewerId: string, ref: { kind: unknown; id: unknown }): Promise<SkillDraftCardView> {
  if (ref.kind === 'asset' && typeof ref.id === 'string') {
    const asset = await db.asset.findUnique({ where: { id: ref.id }, include: { currentVersion: true, draft: true } })
    const target = await libraryTarget(db)
    const viewer = await personActor(viewerId, db)
    if (!asset || asset.removedAt || !may(viewer, 'editDraft', target)) throw new ProposalRefused(NOTHING_HERE, 404)
    return {
      name: identityOf(asset), revision: asset.draft?.revision ?? null, published: asset.currentVersion?.version ?? null,
      mayPublish: may(viewer, 'publish', target), openHref: '/library',
    }
  }
  if (ref.kind !== 'place') throw new ProposalRefused(NOTHING_HERE, 404)
  const { ctx, skill } = await placeOfSkill(db, ref.id).catch(() => { throw new ProposalRefused(NOTHING_HERE, 404) })
  const viewer: PersonActor = await personActor(viewerId, db, ctx.target.level === 'project' ? ctx.target.projectId : undefined)
  if (!may(viewer, 'editDraft', ctx.target)) throw new ProposalRefused(NOTHING_HERE, 404)
  const draft = await db.draft.findUnique({ where: { placeSkillId: skill.id }, select: { revision: true } })
  const newest = await newestVersion(db, skill.id)
  const project = await db.project.findUnique({ where: { id: ctx.projectId }, select: { key: true } })
  return {
    name: skillNameOf(skill), revision: draft?.revision ?? null, published: newest ? `version ${newest.number}` : null,
    mayPublish: may(viewer, 'publish', ctx.target), openHref: project ? `/projects/${project.key}` : '/library',
  }
}
