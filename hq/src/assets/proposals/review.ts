/**
 * Reviewing a proposal (spec part 5 *Proposing*; D27, D24; board C3 §4): accept, edit then accept, or reject with a
 * note, by the people the policy lets review at its level. Accepting publishes through the level's own publish path,
 * so its checks and history apply: the Library's (`lifecycle/publish.ts`), making the organisation's own copy first of
 * a skill another publisher signed (D18), or a place's (`places/placeVersions.ts`), switched on at what was published.
 * The reviewer names the content they looked at, and a proposal that has moved on is refused. The agent is told the
 * outcome on its next turn in the conversation it proposed from.
 */
import type { PrismaClient, Proposal } from '@prisma/client'
import type { PackageFile } from '../../library/packages/packageZip'
import { readContent } from '../content'
import { assertMay, type PersonActor } from '../policy'
import { personActor } from '../policyActors'
import { draftFiles } from '../lifecycle/drafts'
import { LifecycleError } from '../lifecycle/errors'
import { discardDraft, saveDraft } from '../lifecycle/draftStore'
import { editAsset } from '../lifecycle/ownCopy'
import { publishDraft } from '../lifecycle/publish'
import { libraryTarget, librarySkill } from '../lifecycle/records'
import { discardPlaceDraft, savePlaceDraft } from '../places/placeDrafts'
import { publishPlaceDraft } from '../places/placeVersions'
import { switchSkill } from '../places/switches'
import type { PlaceContext } from '../places/place'
import { ProposalRefused } from './checks'
import { newLibraryDraft, newPlaceDraft } from './drafting'
import { placeOfProposal } from './target'
import { writeSkillLine } from './card'
import { agentName, personName } from './names'
import { outcomeBody, type OutcomeState } from './types'

const NOTHING = 'Nothing was changed.'
const NOTE_MAX = 1000
const b64 = (files: PackageFile[]) => files.map(f => ({ path: f.path, base64: f.content.toString('base64') }))

type Reviewing = { proposal: Proposal; ctx: PlaceContext | null; reviewer: PersonActor }

async function reviewing(db: PrismaClient, reviewerId: string, proposalId: unknown, digest: unknown): Promise<Reviewing> {
  const proposal = typeof proposalId === 'string' ? await db.proposal.findUnique({ where: { id: proposalId } }) : null
  // A task template's proposal is reviewed on its own page (library/taskTemplates/templateReview.ts).
  if (!proposal || proposal.kind !== 'SKILL') throw new ProposalRefused(`That proposal isn't there. ${NOTHING}`, 404)
  if (proposal.state !== 'OPEN') throw new ProposalRefused(`That proposal has already been reviewed. ${NOTHING}`, 409)
  const ctx = await placeOfProposal(db, proposal)
  const reviewer = await personActor(reviewerId, db, ctx?.target.level === 'project' ? ctx.target.projectId : undefined)
  assertMay(reviewer, 'reviewProposal', ctx ? ctx.target : await libraryTarget(db))
  if (digest !== proposal.digest) throw new ProposalRefused(`The proposal changed since you looked at it. Look at it again. ${NOTHING}`, 409)
  return { proposal, ctx, reviewer }
}

export type AcceptInput = { proposalId: unknown; digest: unknown; files?: unknown; note?: unknown }

/**
 * `assetId` is the Library skill accepting published, so the reviewer can go on to choose its agents; null in a place.
 * `switchedOn` is false when a place refused to switch the published skill on, so agents don't use it there yet.
 */
export async function acceptProposal(db: PrismaClient, reviewerId: string, input: AcceptInput): Promise<{ state: OutcomeState; version: string; assetId: string | null; switchedOn: boolean }> {
  const { proposal, ctx, reviewer } = await reviewing(db, reviewerId, input.proposalId, input.digest)
  const proposed = await readContent(proposal.digest, db)
  const files = input.files === undefined || input.files === null ? proposed : draftFiles(input.files, { manifestAllowed: ctx !== null })
  const changed = JSON.stringify(b64(files)) !== JSON.stringify(b64(proposed))
  const state: OutcomeState = changed ? 'ACCEPTED_WITH_CHANGES' : 'ACCEPTED'
  const extra = typeof input.note === 'string' && input.note.trim() ? ` ${input.note.trim()}` : ''
  const by = `Proposed by ${await agentName(db, proposal.agentId) ?? 'a person'}${proposal.forUserId ? ` for ${await personName(db, proposal.forUserId)}` : ''}`
  const note = `${by}: ${proposal.why}`.slice(0, NOTE_MAX - extra.length) + extra

  const published = ctx ? await acceptInPlace(db, reviewer, proposal, ctx, files, note) : await acceptInLibrary(db, reviewer, proposal, files, note)
  await settle(db, proposal, reviewer.userId, state, typeof input.note === 'string' ? input.note.trim() || null : null, published.versionId, published.switchedOn)
  return { state, version: published.version, assetId: published.assetId, switchedOn: published.switchedOn }
}

export async function rejectProposal(db: PrismaClient, reviewerId: string, input: { proposalId: unknown; digest: unknown; note: unknown }): Promise<{ state: 'REJECTED' }> {
  const { proposal, reviewer } = await reviewing(db, reviewerId, input.proposalId, input.digest)
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, NOTE_MAX) : ''
  if (!note) throw new ProposalRefused(`Say why it isn't accepted; the agent and the person read it. ${NOTHING}`)
  await settle(db, proposal, reviewer.userId, 'REJECTED', note, null)
  return { state: 'REJECTED' }
}

/** A draft someone is working on is never written over by an accepted proposal. */
function refuseOpenDraft(name: string): never {
  throw new ProposalRefused(`${name} has a draft someone is working on. Publish or discard that draft first, then accept this. ${NOTHING}`, 409)
}

async function acceptInLibrary(db: PrismaClient, reviewer: PersonActor, p: Proposal, files: PackageFile[], note: string) {
  let assetId: string
  if (p.assetId) {
    const original = await librarySkill(db, p.assetId)
    assetId = (await editAsset(db, reviewer, { assetId: original.id }, new Date())).assetId
    if (await db.draft.findUnique({ where: { assetId } })) refuseOpenDraft(p.name)
    await saveDraft(db, reviewer, { assetId, files: b64(files), revision: null, conversationId: p.conversationId })
  } else {
    assetId = (await newLibraryDraft(db, reviewer, p.name, files, p.conversationId)).assetId
  }
  const draft = await db.draft.findUniqueOrThrow({ where: { assetId } })
  try {
    const out = await publishDraft(db, reviewer, { assetId, revision: draft.revision, note })
    const version = await db.assetVersion.findFirstOrThrow({ where: { assetId, version: out.version }, select: { id: true } })
    return { version: `${out.identity} ${out.version}`, versionId: version.id, assetId, switchedOn: true }
  } catch (err) {
    // The draft accepting made goes again, so the proposal can be accepted later or rejected.
    await discardDraft(db, reviewer, { assetId, revision: draft.revision }).catch(() => undefined)
    throw err
  }
}

async function acceptInPlace(db: PrismaClient, reviewer: PersonActor, p: Proposal, ctx: PlaceContext, files: PackageFile[], note: string) {
  let placeSkillId: string
  if (p.placeSkillId) {
    placeSkillId = p.placeSkillId
    if (await db.draft.findUnique({ where: { placeSkillId } })) refuseOpenDraft(p.name)
    await savePlaceDraft(db, reviewer, { placeSkillId, files: b64(files), revision: null, conversationId: p.conversationId })
  } else {
    placeSkillId = (await newPlaceDraft(db, reviewer, ctx, p.name, files, p.conversationId)).placeSkillId
  }
  const draft = await db.draft.findUniqueOrThrow({ where: { placeSkillId } })
  let published: { number: number; fingerprint: string }
  try {
    published = await publishPlaceDraft(db, reviewer, { placeSkillId, revision: draft.revision, note })
  } catch (err) {
    await discardPlaceDraft(db, reviewer, { placeSkillId, revision: draft.revision }).catch(() => undefined)
    throw err
  }
  // Accepting is the review: what was published runs there (board C3 §4, "switched on").
  // A refusal (the place's default is Never, or its files changed since) leaves it published and off; the page and the agent are told.
  let switchedOn = true
  await switchSkill(db, reviewer, { placeSkillId, on: true, fingerprint: published.fingerprint }).catch(err => {
    if (!(err instanceof LifecycleError)) throw err
    switchedOn = false
  })
  const version = await db.placeSkillVersion.findFirstOrThrow({ where: { placeSkillId, number: published.number }, select: { id: true } })
  return { version: `version ${published.number}`, versionId: version.id, assetId: null, switchedOn }
}

async function settle(db: PrismaClient, p: Proposal, reviewerId: string, state: OutcomeState, note: string | null, resultVersionId: string | null, switchedOn = true): Promise<void> {
  const { count } = await db.proposal.updateMany({
    where: { id: p.id, state: 'OPEN' },
    data: { state, reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note, resultVersionId },
  })
  if (count === 0) throw new ProposalRefused(`Someone reviewed this proposal at the same moment. ${NOTHING}`, 409)
  if (!p.conversationId) return
  const name = await personName(db, reviewerId) ?? 'a reviewer'
  await writeSkillLine(p.conversationId, outcomeBody(p.id, p.name, state, name, note, switchedOn), `skill-outcome:${p.id}`)
}
