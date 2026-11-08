/**
 * `propose_skill` (spec part 5 *Proposing a skill*; adr-0159; D24, D27; security review H5): the agent's only way to
 * write a skill. Checked as `propose_workflow` is, then routed (`route.ts`): the person's own draft, from their own
 * interactive conversation where they may edit at that level; otherwise a proposal aimed at that level, which its
 * reviewers accept or reject (`review.ts`). It never writes a file and nothing it makes is live. At most five per run.
 */
import type { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { fingerprintOf, storeContent } from '../content'
import { may, type AgentActor } from '../policy'
import { personActor } from '../policyActors'
import { saveDraft } from '../lifecycle/draftStore'
import { organisationPublisher } from '../organisationPublisher'
import { savePlaceDraft, skillNameOf } from '../places/placeDrafts'
import { checkProposal, ProposalRefused, type CheckedProposal } from './checks'
import { newLibraryDraft, newPlaceDraft } from './drafting'
import { landingOf } from './route'
import { aimOf, reviewersOf, type Aimed } from './target'
import { conversationOfRun, writeSkillLine } from './card'
import type { ProposingRun } from './caller'
import { draftCardBody, MAX_PROPOSALS_PER_RUN, proposalCardBody, type ProposeSkillResult } from './types'

const NOTHING = 'Nothing was changed.'
const fileArgs = (c: CheckedProposal) => c.files.map(f => ({ path: f.path, base64: f.content.toString('base64') }))

export async function proposeSkill(db: PrismaClient, run: ProposingRun, args: Record<string, unknown>): Promise<ProposeSkillResult> {
  const checked = checkProposal(args)
  const made = (await db.proposal.count({ where: { runId: run.runId } })) + (await db.draftRevision.count({ where: { proposedByRunId: run.runId } }))
  if (made >= MAX_PROPOSALS_PER_RUN) {
    throw new ProposalRefused(`This run has already proposed ${made} skills or changes, the most one run may. Tell the person what else you would propose. ${NOTHING}`, 429)
  }
  const aimed = await aimOf(db, { aim: checked.aim, edits: checked.edits, projectId: run.projectId, personId: run.forUserId, agentId: run.agentId })
  const publisher = aimed.aim === 'ORGANISATION' ? await organisationPublisher(db) : null
  const editedName = aimed.aim === 'ORGANISATION' ? aimed.asset?.name : aimed.placeSkill ? skillNameOf(aimed.placeSkill) : undefined
  if (editedName !== undefined && editedName !== checked.name) {
    throw new ProposalRefused(`A change keeps the skill's name: send name ${editedName}. ${NOTHING}`)
  }
  if (aimed.aim === 'ORGANISATION' && !aimed.asset && publisher) {
    const own = await db.asset.findUnique({ where: { kind_publisher_name: { kind: 'SKILL', publisher, name: checked.name } }, select: { id: true } })
    if (own) throw new ProposalRefused(`The Library already has ${publisher}/${checked.name}. To change it, call again with edits: ${publisher}/${checked.name}. ${NOTHING}`, 409)
  }
  const person = await personActor(run.forUserId, db, aimed.target.level === 'project' ? aimed.target.projectId : undefined)
  const actor: AgentActor = { kind: 'agent', agentId: run.agentId, forUserId: run.forUserId, runId: run.runId, person }
  const editsSigned = aimed.aim === 'ORGANISATION' && aimed.asset !== null && aimed.asset.publisher !== publisher
  const conversationId = await conversationOfRun(run.runId)
  const landing = landingOf({ ownConversation: run.ownConversation, mayEdit: may(actor, 'editDraft', aimed.target), editsSigned })

  if (landing === 'draft') {
    const draft = await toDraft(db, actor, aimed, checked, conversationId)
    if (conversationId) await writeSkillLine(conversationId, draftCardBody(draft.ref, checked.name, draft.revision), `skill-draft:${draft.ref.kind}:${draft.ref.id}:${draft.revision}`)
    return {
      landed: 'draft', name: checked.name, revision: draft.revision, warnings: checked.warnings,
      note: 'It is now the person\'s draft. No agent uses it until a person publishes it; the person sees a card with Open draft and Publish. Don\'t write it into files.',
    }
  }
  const proposal = await toProposal(db, run, aimed, checked, conversationId)
  const reviewers = await reviewersOf(db, aimed)
  if (conversationId) await writeSkillLine(conversationId, proposalCardBody(proposal, checked.name, checked.edits !== null), `skill-proposal:${proposal}`)
  return {
    landed: 'proposal', name: checked.name, proposal, reviewers, warnings: checked.warnings,
    note: `It waits for review by ${reviewers}. No agent uses it until they accept it, and you are told the outcome. Don't write it into files.`,
  }
}

async function toDraft(db: PrismaClient, actor: AgentActor, aimed: Aimed, checked: CheckedProposal, conversationId: string | null) {
  const files = fileArgs(checked)
  if (aimed.aim === 'ORGANISATION') {
    if (aimed.asset) {
      const saved = await saveDraft(db, actor, { assetId: aimed.asset.id, files, conversationId })
      return { ref: { kind: 'asset' as const, id: aimed.asset.id }, revision: saved.revision }
    }
    const made = await newLibraryDraft(db, actor, checked.name, checked.files, conversationId)
    return { ref: { kind: 'asset' as const, id: made.assetId }, revision: made.revision }
  }
  if (aimed.placeSkill) {
    const saved = await savePlaceDraft(db, actor, { placeSkillId: aimed.placeSkill.id, files, conversationId })
    return { ref: { kind: 'place' as const, id: aimed.placeSkill.id }, revision: saved.revision }
  }
  const made = await newPlaceDraft(db, actor, aimed.ctx, checked.name, checked.files, conversationId)
  return { ref: { kind: 'place' as const, id: made.placeSkillId }, revision: made.revision }
}

/** One open proposal per name at a level: the same content again answers the open one; other content waits for its review. */
async function toProposal(db: PrismaClient, run: ProposingRun, aimed: Aimed, checked: CheckedProposal, conversationId: string | null): Promise<string> {
  const placeId = aimed.placeId
  const open = () => db.proposal.findFirst({ where: { kind: 'SKILL', aim: aimed.aim, placeId, name: checked.name, state: 'OPEN' }, select: { id: true, digest: true } })
  const answer = (o: { id: string; digest: string }, digest: string) => {
    if (o.digest === digest) return o.id
    throw new ProposalRefused(`A proposal of ${checked.name} is already waiting for review there. Wait for its review, or propose it under another name. ${NOTHING}`, 409)
  }
  try {
    return await db.$transaction(async tx => {
      const digest = await storeContent(checked.files, tx)
      const waiting = await tx.proposal.findFirst({ where: { kind: 'SKILL', aim: aimed.aim, placeId, name: checked.name, state: 'OPEN' }, select: { id: true, digest: true } })
      if (waiting) return answer(waiting, digest)
      const row = await tx.proposal.create({
        data: {
          aim: aimed.aim, placeId, name: checked.name, description: checked.description, why: checked.why, digest,
          assetId: aimed.aim === 'ORGANISATION' ? aimed.asset?.id ?? null : null,
          placeSkillId: aimed.aim !== 'ORGANISATION' ? aimed.placeSkill?.id ?? null : null,
          agentId: run.agentId, forUserId: run.forUserId, conversationId, runId: run.runId,
        },
        select: { id: true },
      })
      return row.id
    })
  } catch (err) {
    // Two calls at once: the partial unique index lets one in; the other reads it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const o = await open()
      if (o) return answer(o, fingerprintOf(checked.files))
    }
    throw err
  }
}
