/**
 * The lead's own tool at Ask (conversation layer spec, Approval, two cases, one shape). The call does not run: its
 * TOOL operation is created waiting for approval with the arguments sealed, the approval card is written — what it
 * does, the lead's reason, who asks, where — and the lead is told `waitingApproval`, so it finishes its reply in its
 * own words. The card awaits no turn: the lead is in its turn now. The answer runs the call or ends it (owner.ts).
 */
import { Prisma } from '@prisma/client'
import { prisma } from 'wasp/server'
import { z } from 'zod'
import type { ApprovalRequestBody } from '../../../shared/conversations/protocol'
import type { ToolCallOutcome, TurnCapability } from '../../contract'
import { sealJson, sealText } from '../../sealing'
import { appendMessage } from '../../store/messages'
import { conversationEvents } from '../../coordinator/events'
import { boundaryName } from '../../coordinator/continuationChecks'
import { idempotencyKey, toolCallTitle } from '../../tools/turnTools'
import { outstandingOperations } from '../settle'

export const REASON_MAX_CHARS = 500
const WHAT_MAX_CHARS = 300

/** A waiting call's key is its own: the same call, approved, then runs under the plain key without meeting it. */
export const ASK_KEY_PREFIX = 'ask:'

const REASON_DESCRIPTION =
  'Why you want to do this, in one line the person reads on the approval card ("to tidy the board before the release").'

/** Added to the description of a tool the lead may use only by asking. */
export const ASK_NOTE =
  "This needs the person's approval first: calling it does not run it. Pass `reason`; the person is shown an " +
  'approval card, and you say in your reply what you asked for and why. It runs if they approve.'

/** The tool's input with the reason the card shows, which the call itself never receives. */
export function withReason(input: z.ZodType): z.ZodType {
  const reason = { reason: z.string().trim().min(1).max(REASON_MAX_CHARS).describe(REASON_DESCRIPTION) }
  return input instanceof z.ZodObject ? input.extend(reason) : input.and(z.object(reason))
}

/** What the call would do, in words for the card: the tool, and the arguments a person reads (never ids). */
export function describeCall(toolName: string, args: Record<string, unknown>): string {
  const shown = Object.entries(args)
    .filter(([key, value]) => !/id$/i.test(key) && ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : String(value)}`)
  const text = shown.length > 0 ? `${toolCallTitle(toolName)} (${shown.join(', ')})` : toolCallTitle(toolName)
  return text.length > WHAT_MAX_CHARS ? `${text.slice(0, WHAT_MAX_CHARS - 1)}…` : text
}

function boundaryOf(capability: TurnCapability, person: string): { boundaryType: 'user' | 'project'; boundaryId: string } | null {
  if (capability.home === 'PERSON') return { boundaryType: 'user', boundaryId: person }
  return capability.projectId ? { boundaryType: 'project', boundaryId: capability.projectId } : null
}

async function withKey(conversationId: string, key: string) {
  return prisma.operation.findUnique({
    where: { conversationId_idempotencyKey: { conversationId, idempotencyKey: key } },
    select: { id: true, state: true },
  })
}

function outcomeOf(row: { id: string; state: string }): ToolCallOutcome {
  return row.state === 'WAITING_FOR_APPROVAL' ? { status: 'waitingApproval', operationId: row.id } : { status: 'accepted', operationId: row.id }
}

export interface AskInput {
  capability: TurnCapability
  toolName: string
  /** The call's own arguments, without the reason. */
  args: Record<string, unknown>
  reason: string
}

export async function askFirst({ capability, toolName, args, reason }: AskInput): Promise<ToolCallOutcome> {
  const person = capability.actingUserId
  if (!person) return { status: 'refused', reason: `${toolName} changes something, and this reply acts for no one` }
  const { conversationId } = capability
  const key = `${ASK_KEY_PREFIX}${idempotencyKey(toolName, args)}`
  // The same ask while it is pending is that one: one card, one answer.
  const pending = await withKey(conversationId, key)
  if (pending) return outcomeOf(pending)

  const title = toolCallTitle(toolName)
  const boundary = boundaryOf(capability, person)
  let operationId: string
  try {
    const row = await prisma.operation.create({
      data: {
        conversationId,
        turnId: capability.turnId,
        kind: 'TOOL',
        mode: 'FOREGROUND',
        toolName,
        idempotencyKey: key,
        state: 'WAITING_FOR_APPROVAL',
        title: sealText(title),
        args: sealJson(args),
        authorisedById: person,
        ...boundary,
      },
      select: { id: true },
    })
    operationId = row.id
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await withKey(conversationId, key)
      if (winner) return outcomeOf(winner)
    }
    throw err
  }

  const agent = await prisma.agent.findUnique({ where: { id: capability.agentId }, select: { name: true } })
  const body: ApprovalRequestBody = {
    title,
    reason: reason.trim(),
    askedBy: agent?.name ?? 'The agent',
    what: describeCall(toolName, args),
    ...(boundary ? { boundaryName: await boundaryName(boundary.boundaryType, boundary.boundaryId) } : {}),
  }
  const { message } = await appendMessage({
    conversationId, role: 'PLATFORM', kind: 'APPROVAL_REQUEST', body, operationId, clientMessageId: `approval:${operationId}:ask`,
  })
  conversationEvents.message(conversationId, message)
  conversationEvents.operation({
    conversationId, operationId, state: 'WAITING_FOR_APPROVAL', title, outstanding: await outstandingOperations(conversationId),
  })
  return { status: 'waitingApproval', operationId }
}
