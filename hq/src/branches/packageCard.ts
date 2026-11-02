/**
 * An agent's ask about a blocked package in its branch's copy, with no live preview open (adr-0170): the site says
 * `branch.packageBlocked` once the agent found no other package, and hq puts a card in the branch's task thread or
 * conversation, written as the merge card is (`mergeCard.ts`): an operation waiting for approval and an
 * `APPROVAL_REQUEST` message. A Member or Admin of the project, or the person whose own storage it is, answers it;
 * *Allow* is their own press (`packageCardAnswer.ts`). The question is HQ's, worded from the registry's facts as the
 * live preview's strip words it; the site's sentence is never shown.
 *
 * Everything in the frame is checked against hq's own records first: the copy must be one hq made, on the site that
 * sent it, of that workspace's open branch, and the run named must be going on that branch now. At most one card per
 * branch and package version waits.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import {
  BRANCH_PACKAGE_BLOCKED_EVENT, installScriptQuestion, isCopyId, isGitBranchName, parseBlockedPackageRef,
  type ApprovalRequestBody, type BlockedPackageRef, type InstallScriptVerdict, type PackageFacts,
} from '@agenthix/core'
import { appendMessage } from '../conversations/store/messages'
import { conversationEvents } from '../conversations/coordinator/events'
import { boundaryName } from '../conversations/coordinator/continuationChecks'
import { approvalLine } from '../conversations/coordinator/cards'
import { notifyCard, type CardNotice } from '../conversations/coordinator/notify'
import { outstandingOperations } from '../conversations/work/settle'
import { sealJson, sealText } from '../conversations/sealing'
import { onSiteEvent } from '../sites/channel/siteEventHandler'
import { Logger } from '../server/utils/logger'
import { lockWork, workOfBranch, type WorkOf } from './branchRows'
import { cardConversation } from './mergeCard'
import { runsOnBranches } from './working'
import { PACKAGE_CARD_TOOL, packageCardKeyPrefix, type PackageCardArgs } from './packageCardArgs'

const logger = new Logger('PackageCard')

type BlockedFrame = {
  workspace: { ownerType: string; ownerId: string; workspaceId: string }
  copyId: string
  branch: string
  runId: string
  package: BlockedPackageRef
  verdict: InstallScriptVerdict
  facts: PackageFacts | null
}

/** The fields hq reads, each checked; null for a frame that does not fit. */
export function parsePackageBlocked(data: unknown): BlockedFrame | null {
  if (!data || typeof data !== 'object') return null
  const e = data as Record<string, unknown>
  const ws = e.workspace as Record<string, unknown> | undefined
  if (!ws || typeof ws.ownerType !== 'string' || typeof ws.ownerId !== 'string' || typeof ws.workspaceId !== 'string') return null
  const pkg = parseBlockedPackageRef(e.package)
  if (!pkg || !isCopyId(e.copyId) || !isGitBranchName(e.branch)) return null
  if (typeof e.runId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(e.runId)) return null
  if (!e.verdict || typeof e.verdict !== 'object' || Array.isArray(e.verdict)) return null
  const facts = e.facts && typeof e.facts === 'object' && !Array.isArray(e.facts) ? (e.facts as PackageFacts) : null
  return {
    workspace: { ownerType: ws.ownerType, ownerId: ws.ownerId, workspaceId: ws.workspaceId },
    copyId: e.copyId, branch: e.branch, runId: e.runId, package: pkg, verdict: e.verdict as InstallScriptVerdict, facts,
  }
}

/** HQ's question, as the live preview's strip words it, for a branch's copy. */
export function packageQuestion(pkg: BlockedPackageRef, facts: PackageFacts | null, verdict: InstallScriptVerdict, now = Date.now()): string {
  let question = ''
  try {
    question = installScriptQuestion(facts && facts.name === pkg.name ? facts : null, verdict, now)
  } catch {
    question = ''
  }
  return (question || `${pkg.name} ${pkg.version} runs code when installed. Let its install script run in this branch's copy?`).slice(0, 1000)
}

export type PackageAsk = {
  work: WorkOf
  branch: { id: string; name: string; workspaceId: string; ownerType: 'user' | 'project'; ownerId: string; userId: string }
  copyId: string
  agentName: string
  package: BlockedPackageRef
  question: string
}

/** Puts the card in the branch's thread; false when one for this package already waits there. */
export async function askAboutPackage(ask: PackageAsk): Promise<boolean> {
  const b = ask.branch
  const conversationId = await cardConversation(ask.work, b.userId)
  const args: PackageCardArgs = {
    branchId: b.id, workspaceId: b.workspaceId, branch: b.name, copyId: ask.copyId,
    name: ask.package.name, version: ask.package.version, question: ask.question, agentName: ask.agentName,
  }
  const title = `Let ${ask.package.name} ${ask.package.version} run its install script`
  const prefix = packageCardKeyPrefix(b.id, ask.package.name, ask.package.version)
  const made = await prisma.$transaction(async (tx) => {
    await lockWork(tx, ask.work)
    const waiting = await tx.operation.findFirst({
      where: { conversationId, toolName: PACKAGE_CARD_TOOL, state: 'WAITING_FOR_APPROVAL', idempotencyKey: { startsWith: prefix } },
      select: { id: true },
    })
    if (waiting) return null
    return tx.operation.create({
      data: {
        conversationId, kind: 'TOOL', mode: 'BACKGROUND', toolName: PACKAGE_CARD_TOOL,
        idempotencyKey: `${prefix}${randomUUID()}`,
        state: 'WAITING_FOR_APPROVAL', title: sealText(title),
        args: sealJson(args as unknown as Record<string, unknown>),
        authorisedById: b.userId, boundaryType: b.ownerType, boundaryId: b.ownerId,
      },
      select: { id: true },
    })
  })
  if (!made) return false
  const body: ApprovalRequestBody = {
    title,
    reason: ask.question,
    askedBy: ask.agentName,
    what: `${ask.agentName} asks to run ${ask.package.name} ${ask.package.version}'s install script on ${b.name}`,
    boundaryName: await boundaryName(b.ownerType, b.ownerId),
  }
  const { message } = await appendMessage({
    conversationId, role: 'PLATFORM', kind: 'APPROVAL_REQUEST', body, operationId: made.id, clientMessageId: `approval:${made.id}:package`,
  })
  conversationEvents.message(conversationId, message)
  conversationEvents.operation({
    conversationId, operationId: made.id, state: 'WAITING_FOR_APPROVAL', title, outstanding: await outstandingOperations(conversationId),
  })
  await notifyCard({ conversationId, card: message as CardNotice['card'], line: approvalLine(body), approval: true })
  return true
}

const dropped = (siteId: string, why: string) => logger.warn(`site ${siteId}: ${BRANCH_PACKAGE_BLOCKED_EVENT} ${why} — dropped`)

export async function handlePackageBlocked(siteId: string, data: unknown): Promise<void> {
  const e = parsePackageBlocked(data)
  if (!e) return dropped(siteId, 'is malformed')
  const copy = await prisma.branchCopy.findUnique({
    where: { folderId: e.copyId },
    include: { branch: true, site: { select: { siteId: true } } },
  })
  const b = copy?.branch
  if (!copy || !b || copy.removedAt || copy.site.siteId !== siteId || b.state !== 'OPEN' || b.workspaceId !== e.workspace.workspaceId ||
      b.ownerType !== e.workspace.ownerType || b.ownerId !== e.workspace.ownerId || b.name !== e.branch) {
    return dropped(siteId, 'names a copy that is not its own, or not that open branch')
  }
  const work = workOfBranch(b)
  if (!work) return dropped(siteId, 'names a branch that is no work\'s')
  const runs = await runsOnBranches(siteId, b, [b]).catch(() => new Map<string, { runId: string; agentName: string }>())
  const run = runs.get(b.id)
  if (!run || run.runId !== e.runId) return dropped(siteId, 'names a run that is not going on that branch')
  try {
    await askAboutPackage({
      work, branch: b, copyId: e.copyId, agentName: run.agentName, package: e.package,
      question: packageQuestion(e.package, e.facts, e.verdict),
    })
  } catch (err) {
    logger.warn(`site ${siteId}: no card for ${e.package.name}@${e.package.version} on ${b.name}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

onSiteEvent(BRANCH_PACKAGE_BLOCKED_EVENT, handlePackageBlocked)
