/**
 * Writing an agent's asset request as an approval card (spec part 5, D31), in the conversation whose work made the
 * run, the way a proposed workflow's card is written (`workflows/review/card.ts`): an operation of the conversation
 * waiting for approval, holding the request sealed, and an `APPROVAL_REQUEST` message. Nothing is done here, whatever
 * the agent's approval mode: the card waits for the person the run acts for (`answer.ts`).
 *
 * A request the person couldn't approve anyway is refused at once with the policy's words, and so is one from a run
 * no conversation started, since there is nobody to show the card to.
 */
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import type { ApprovalRequestBody } from '@agenthix/core'
import { appendMessage } from '../../conversations/store/messages'
import { conversationEvents } from '../../conversations/coordinator/events'
import { boundaryName } from '../../conversations/coordinator/continuationChecks'
import { approvalLine } from '../../conversations/coordinator/cards'
import { notifyCard, type CardNotice } from '../../conversations/coordinator/notify'
import { outstandingOperations } from '../../conversations/work/settle'
import { sealJson, sealText } from '../../conversations/sealing'
import { idempotencyKey } from '../../conversations/tools/turnTools'
import { may, refusal } from '../policy'
import { organisationTarget, personActor } from '../policyActors'
import { describeRequest, RequestRefused } from './describe'
import {
  actionOf, ASSET_REQUEST_KEY_PREFIX, ASSET_REQUEST_TOOL, parseAssetRequest, policyTarget,
  type AssetRequestArgs, type AssetRequester,
} from './types'

const NOTHING = 'Nothing was changed.'
/** Requests waiting in one conversation at once; more is an agent asking in a loop. */
export const MAX_WAITING_REQUESTS = 5

export type AssetRequestResult = { operationId: string; waitsForPerson: true }

async function conversationOf(runId: string) {
  const op = await prisma.operation.findFirst({
    where: { runId },
    orderBy: { createdAt: 'desc' },
    select: { conversationId: true, conversation: { select: { status: true, agent: { select: { name: true } } } } },
  })
  return op && op.conversation.status !== 'CLOSED' ? op : null
}

export async function requestAssetChange(requester: AssetRequester, raw: unknown): Promise<AssetRequestResult> {
  const request = parseAssetRequest(raw)
  if (!request) throw new RequestRefused(`That request isn't one HQ knows: an agent may ask to publish, roll back, switch a skill on or install. ${NOTHING}`, 400)
  const subject = await describeRequest(prisma, request)
  const action = actionOf(request)
  const person = await personActor(requester.forUserId, prisma, subject.target.level === 'project' ? subject.target.projectId : undefined)
  const target = policyTarget(subject.target, (await organisationTarget(prisma)).outsideInstallers)
  if (!may(person, action, target)) {
    throw new RequestRefused(`The person this run is for can't approve this. ${refusal(person, action, target)}`, 403)
  }
  const at = await conversationOf(requester.runId)
  if (!at) throw new RequestRefused(`This needs a person's approval in a conversation, and this run has none. Ask the person to do it themselves. ${NOTHING}`)
  const { conversationId } = at

  const args: AssetRequestArgs = { request, requester, target: subject.target, action }
  const key = `${ASSET_REQUEST_KEY_PREFIX}${idempotencyKey(ASSET_REQUEST_TOOL, { request, requester })}`
  const same = await prisma.operation.findUnique({ where: { conversationId_idempotencyKey: { conversationId, idempotencyKey: key } }, select: { id: true, state: true } })
  if (same) {
    if (same.state === 'WAITING_FOR_APPROVAL') return { operationId: same.id, waitsForPerson: true }
    throw new RequestRefused(`The person has already answered this same request. ${NOTHING}`)
  }
  const waiting = await prisma.operation.count({ where: { conversationId, toolName: ASSET_REQUEST_TOOL, state: 'WAITING_FOR_APPROVAL' } })
  if (waiting >= MAX_WAITING_REQUESTS) {
    throw new RequestRefused(`${waiting} requests are already waiting for the person here. Wait for their answers before asking again. ${NOTHING}`, 409)
  }

  const boundary: { boundaryType: 'user' | 'project'; boundaryId: string } | null = subject.target.level === 'project'
    ? { boundaryType: 'project', boundaryId: subject.target.projectId }
    : subject.target.level === 'person' ? { boundaryType: 'user', boundaryId: subject.target.userId } : null
  let operationId: string
  try {
    const row = await prisma.operation.create({
      data: {
        conversationId, kind: 'TOOL', mode: 'BACKGROUND', toolName: ASSET_REQUEST_TOOL, idempotencyKey: key,
        state: 'WAITING_FOR_APPROVAL', title: sealText(subject.title),
        args: sealJson(args as unknown as Record<string, unknown>),
        authorisedById: requester.forUserId, ...(boundary ?? {}),
      },
      select: { id: true },
    })
    operationId = row.id
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const row = await prisma.operation.findUniqueOrThrow({ where: { conversationId_idempotencyKey: { conversationId, idempotencyKey: key } }, select: { id: true } })
      return { operationId: row.id, waitsForPerson: true }
    }
    throw err
  }

  const body: ApprovalRequestBody = {
    title: subject.title,
    reason: subject.reason,
    askedBy: at.conversation.agent?.name ?? 'The agent',
    what: subject.what,
    ...(boundary ? { boundaryName: await boundaryName(boundary.boundaryType, boundary.boundaryId) } : {}),
  }
  const { message } = await appendMessage({
    conversationId, role: 'PLATFORM', kind: 'APPROVAL_REQUEST', body, operationId, clientMessageId: `approval:${operationId}:asset`,
  })
  conversationEvents.message(conversationId, message)
  conversationEvents.operation({
    conversationId, operationId, state: 'WAITING_FOR_APPROVAL', title: subject.title, outstanding: await outstandingOperations(conversationId),
  })
  await notifyCard({ conversationId, card: message as CardNotice['card'], line: approvalLine(body), approval: true })
  return { operationId, waitsForPerson: true }
}
