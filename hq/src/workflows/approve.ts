/**
 * Approving and declining a version (workflows spec part 1, *A version*, *R4 · Who approves*, *A version's life*):
 * every approval goes through here. An approval is of one version of one workflow in one place, named by its hash,
 * stored as (workflow, place, hash, who, when), never as "this hash is approved". A newer approved version
 * supersedes the old; a version waiting never stops the approved one. Never callable by an agent.
 *
 * The decisions are `rules.ts`'s; this gathers the facts and makes the change in one transaction, the version's
 * state moved only from waiting, so two people approving at once leave one approval.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GitHubPermissions, WorkflowDefinition } from '@agenthix/core'
import { isOrgAdmin } from '../projects/membership'
import { mayAdministerPlace, AGENT_REFUSAL, type WorkflowActor, type WorkflowPlace } from './placeAccess'
import { afterApproval, mayApproveVersion, mayDecideVersion, mayDeclineVersion, type Decision, type VersionFacts } from './rules'
import { storedVersionMatches } from './versionContent'
import { closeCardsOf } from './closeCards'

export type DecideInput = { workflowId: string; hash: string }
export type ApproveInput = DecideInput & { via: 'review' | 'card' }

function enforce(d: Decision): void {
  if (!d.ok) throw new HttpError(d.status, d.message)
}

async function loadVersion(workflowId: string, hash: string) {
  const version = await prisma.workflowVersion.findUnique({
    where: { workflowId_hash: { workflowId, hash } },
    include: { workflow: { select: { placeType: true, placeId: true } }, files: true },
  })
  if (!version) throw new HttpError(404, 'There is no version of this workflow with that hash. Nothing was changed.')
  return version
}

function facts(v: Awaited<ReturnType<typeof loadVersion>>): VersionFacts {
  return { state: v.state, number: v.number, hash: v.hash, checked: v.checkFlags !== null, cardMayApprove: v.cardMayApprove }
}

async function requirePerson(actor: WorkflowActor): Promise<string> {
  if (actor.kind !== 'person') throw new HttpError(403, AGENT_REFUSAL)
  return actor.userId
}

export async function approveWorkflowVersion(input: ApproveInput, actor: WorkflowActor): Promise<{ number: number; enabled: boolean }> {
  const userId = await requirePerson(actor)
  const version = await loadVersion(input.workflowId, input.hash)
  const place: WorkflowPlace = { type: version.workflow.placeType, id: version.workflow.placeId }
  const github = ((version.definition as unknown as WorkflowDefinition).github ?? {}) as GitHubPermissions
  enforce(mayDecideVersion({
    placeType: place.type,
    administers: await mayAdministerPlace(place, userId),
    isOrgAdmin: place.type === 'user' ? await isOrgAdmin(userId) : false,
    github,
  }, 'approve'))
  const approved = await prisma.workflowVersion.findFirst({
    where: { workflowId: input.workflowId, state: 'APPROVED' },
    select: { number: true },
  })
  enforce(mayApproveVersion(facts(version), input.hash, approved?.number ?? null, input.via))
  if (!(await storedVersionMatches(version, input.hash))) {
    throw new HttpError(409, `Version ${version.number} no longer matches its hash, so it can't be approved. Nothing was changed.`)
  }

  // A card answered with Approve settles its own card (review/cardAnswer.ts); every other card of these versions closes.
  const decided: string[] = input.via === 'card' ? [] : [version.id]
  const result = await prisma.$transaction(async (tx) => {
    // Writing the workflow's row first holds its lock, so approvals of two of its versions at once run one by one.
    await tx.workflow.update({ where: { id: input.workflowId }, data: { updatedAt: new Date() } })
    const approvedNow = await tx.workflowVersion.findFirst({
      where: { workflowId: input.workflowId, state: 'APPROVED' },
      select: { number: true },
    })
    if (approvedNow && approvedNow.number > version.number) {
      throw new HttpError(409, `Version ${approvedNow.number} was approved just now, and is newer. Nothing was changed.`)
    }
    const moved = await tx.workflowVersion.updateMany({
      where: { id: version.id, state: 'PROPOSED' },
      data: { state: 'APPROVED' },
    })
    if (moved.count !== 1) throw new HttpError(409, `Version ${version.number} was decided by someone else just now. Nothing was changed.`)
    const others = await tx.workflowVersion.findMany({
      where: { workflowId: input.workflowId, id: { not: version.id } },
      select: { id: true, number: true, state: true },
    })
    const everApproved = (await tx.workflowApproval.count({ where: { workflowId: input.workflowId } })) > 0
    const after = afterApproval(version.number, others, everApproved)
    decided.push(...after.supersede)
    if (after.supersede.length) {
      await tx.workflowVersion.updateMany({ where: { id: { in: after.supersede } }, data: { state: 'SUPERSEDED' } })
    }
    await tx.workflowApproval.create({
      data: {
        workflowId: input.workflowId,
        placeType: place.type,
        placeId: place.id,
        versionId: version.id,
        hash: version.hash,
        approvedById: userId,
      },
    })
    const workflow = after.turnOn
      ? await tx.workflow.update({
        where: { id: input.workflowId },
        data: { enabled: true, enabledChangedById: userId, enabledChangedAt: new Date() },
        select: { enabled: true },
      }).then(async (w) => {
        await tx.workflowSwitch.create({ data: { workflowId: input.workflowId, enabled: true, byUserId: userId, reason: 'first version approved' } })
        return w
      })
      : await tx.workflow.findUniqueOrThrow({ where: { id: input.workflowId }, select: { enabled: true } })
    return { number: version.number, enabled: workflow.enabled }
  })
  await closeCardsOf(decided)
  return result
}

export async function declineWorkflowVersion(input: DecideInput, actor: WorkflowActor): Promise<{ number: number }> {
  const userId = await requirePerson(actor)
  const version = await loadVersion(input.workflowId, input.hash)
  const place: WorkflowPlace = { type: version.workflow.placeType, id: version.workflow.placeId }
  enforce(mayDecideVersion({ placeType: place.type, administers: await mayAdministerPlace(place, userId), isOrgAdmin: false, github: {} }, 'decline'))
  enforce(mayDeclineVersion(facts(version), input.hash))
  const moved = await prisma.workflowVersion.updateMany({
    where: { id: version.id, state: 'PROPOSED' },
    data: { state: 'DECLINED', declinedById: userId, declinedAt: new Date() },
  })
  if (moved.count !== 1) throw new HttpError(409, `Version ${version.number} was decided by someone else just now. Nothing was changed.`)
  await closeCardsOf([version.id])
  return { number: version.number }
}
