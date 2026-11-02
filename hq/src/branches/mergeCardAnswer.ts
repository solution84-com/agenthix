/**
 * Answering an agent's merge card (`mergeCard.ts`): *Merge* is approve, *Not now* is decline. Only a person who may
 * merge here answers it — a Member or Admin of the project, or the person whose own storage it is — and *Merge* only
 * by their own press: an approval passed on by the conversation's agent from someone's words is refused, since that
 * press is the only proof a person asked. *Merge* runs the merge the workspace view's dialog runs, as the person who
 * pressed it, onto the `main` the card was made against; when `main` has moved since, nothing is merged and the
 * card's conversation offers the branch's Git panel, where the dialog shows what changed.
 */
import { HttpError, prisma } from 'wasp/server'
import type { SettleOperation } from '../conversations/contract'
import { appendMessage } from '../conversations/store/messages'
import { conversationEvents } from '../conversations/coordinator/events'
import { openBranchById } from './branchRows'
import { mayActIn, reachWorkspace } from './workspaceAccess'
import { mergeBranch } from './merge'
import { asBranchHttp } from './refusals'
import { MERGE_CARD_TOOL, parseMergeCardArgs, type MergeCardArgs } from './mergeCardArgs'
import type { MergeBranchResult } from './views'

const NOTHING = 'Nothing was changed.'

export const MERGE_BY_PRESS = `A merge into main happens when a person presses Merge on its card, not through the agent. ${NOTHING}`

type Boundary = { boundaryType: 'user' | 'project' | null; boundaryId: string | null }

async function mayMerge(op: Boundary, userId: string): Promise<boolean> {
  if (!op.boundaryType || !op.boundaryId) return false
  return mayActIn({ ownerType: op.boundaryType, ownerId: op.boundaryId }, userId)
}

/** Why this person may not answer the card this way, or null when they may. */
export async function mergeAnswerRefusal(op: Boundary, answer: 'approve' | 'decline', answererId: string, via: 'card' | 'turn'): Promise<string | null> {
  if (via === 'turn' && answer === 'approve') return MERGE_BY_PRESS
  if (await mayMerge(op, answererId)) return null
  const who = op.boundaryType === 'user' ? 'the person whose space this is' : 'a Member or Admin of this project'
  return `Only ${who} can answer this; ask them. ${NOTHING}`
}

export type MergeCardDeps = {
  /** Waiting → running, once: false when someone answered first. */
  start(operationId: string): Promise<boolean>
  settle: SettleOperation
  /** Replaced in tests: the merge the dialog runs. */
  merge?: typeof mergeBranch
}

export function staleWords(a: Pick<MergeCardArgs, 'agentName' | 'branch' | 'main'>): string {
  return `${a.main} has changed since ${a.agentName} asked, so ${a.branch} was not merged. Open its Git panel and merge ` +
    `from the dialog, which shows what changed. ${NOTHING}`
}

function doneWords(a: MergeCardArgs, r: Exclude<MergeBranchResult, { outcome: 'main_moved' }>): string {
  if (r.outcome === 'merged') return `Merged ${a.branch} into ${a.main} as v${r.versionNumber}${r.branchClosed ? ', and closed the branch' : ''}.`
  if (r.outcome === 'nothing_to_merge') return `${a.branch} had nothing new to merge into ${a.main}. ${NOTHING}`
  const files = r.clashes.length === 1 ? '1 file' : `${r.clashes.length} files`
  return `Nothing was merged: ${files} changed on ${a.main} too.` +
    (r.agentAsked ? ` ${a.agentName} was asked to bring ${a.branch} up to date first.` : '')
}

/** The line that offers the branch's Git panel, where *Merge into main* is (toolLink's `branch` target). */
async function offerDialog(conversationId: string, a: MergeCardArgs): Promise<void> {
  const { message } = await appendMessage({
    conversationId, role: 'PLATFORM', kind: 'ACTION',
    body: { text: staleWords(a), toolName: MERGE_CARD_TOOL, target: { kind: 'branch', id: a.workspaceId, label: a.branch, params: { branch: a.branch } } },
  })
  conversationEvents.message(conversationId, message)
}

export async function answerMergeCard(
  row: { id: string; conversationId: string; args: Record<string, unknown> | null },
  answer: 'approve' | 'decline',
  byUserId: string,
  deps: MergeCardDeps,
): Promise<void> {
  const args = parseMergeCardArgs(row.args)
  if (answer === 'decline') {
    const summary = args ? `Not now: ${args.branch} was not merged into ${args.main}. ${NOTHING}` : `Not now. ${NOTHING}`
    if (!(await deps.settle(row.id, { state: 'CANCELLED', noReport: true, result: { summary } }))) {
      throw new HttpError(409, 'This request is no longer waiting for an answer.')
    }
    return
  }
  if (!args) throw new HttpError(409, `This request holds no branch to merge. ${NOTHING}`)
  const op = await prisma.operation.findUnique({ where: { id: row.id }, select: { boundaryType: true, boundaryId: true } })
  if (!op || !(await mayMerge(op, byUserId))) throw new HttpError(403, `Only a Member or Admin of this project can merge here. ${NOTHING}`)
  if (!(await deps.start(row.id))) throw new HttpError(409, 'This request is no longer waiting for an answer.')

  const fail = async (status: number, message: string): Promise<never> => {
    await deps.settle(row.id, { state: 'FAILED', error: message })
    throw new HttpError(status, message)
  }
  const branch = await openBranchById(args.workspaceId, args.branchId)
  if (!branch) return fail(409, `${args.branch} is not open any more. ${NOTHING}`)
  let result: MergeBranchResult
  try {
    const ws = await reachWorkspace(branch.workspaceId, byUserId, 'work')
    result = await asBranchHttp(() => (deps.merge ?? mergeBranch)({
      branch, logicalSiteId: ws.logicalSiteId, personId: byUserId, message: args.message, expectedMain: args.expectedMain,
    }))
  } catch (err) {
    if (err instanceof HttpError && err.statusCode < 500) return fail(err.statusCode, err.message)
    await deps.settle(row.id, { state: 'FAILED', error: `${args.branch} could not be merged. ${NOTHING}` })
    throw err
  }
  if (result.outcome === 'main_moved') {
    await deps.settle(row.id, { state: 'FAILED', error: staleWords(args) })
    await offerDialog(row.conversationId, args)
    return
  }
  await deps.settle(row.id, { state: 'COMPLETED', result: { summary: doneWords(args, result) } })
}
