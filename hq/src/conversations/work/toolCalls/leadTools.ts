/**
 * The lead's own tools for what is already under way (conversation layer spec, Approval; Stopping):
 * `answer_approval`, for a person's answer given in words — the lead calls it in its turn on that message, so the
 * answer is taken by this turn and no second one is spent — and `cancel_operation`, for "stop that". Each acts as
 * the person the turn answers, who must still be able to speak here, and is offered only while something waits or
 * runs in the conversation.
 */
import { z } from 'zod'
import { HttpError, prisma } from 'wasp/server'
import { OUTSTANDING_OPERATION_STATES, activityWord } from '../../../shared/conversations/protocol'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from '../../contract'
import { requireConversationSpeaker } from '../../readingRule'
import { openText } from '../../sealing'
import { Logger } from '../../../server/utils/logger'
import { answerRequest, NOTE_MAX_CHARS } from './answer'
import { stopOperation } from './stop'
import { operationTitle, readBackFirst, spokenInput } from '../../voice/readBack'
import { ANSWER_APPROVAL, CANCEL_OPERATION } from '../../tools/toolNames'

const logger = new Logger('ConversationToolCalls')

export { ANSWER_APPROVAL, CANCEL_OPERATION }

function actsForAPerson(capability: TurnCapability): capability is TurnCapability & { actingUserId: string } {
  return !!capability.actingUserId && capability.trigger !== 'REPORT' && capability.expiresAt > Date.now()
}

/**
 * Only a reply to what the person just said answers for them: never a continuation, which runs on no word of
 * theirs, and never a request asked in this same reply (answer.ts).
 */
function answersAPerson(capability: TurnCapability): capability is TurnCapability & { actingUserId: string } {
  return actsForAPerson(capability) && (capability.trigger ?? 'MESSAGE') === 'MESSAGE'
}

async function listed(conversationId: string, states: readonly string[]) {
  const rows = await prisma.operation.findMany({
    where: { conversationId, state: { in: [...states] as (typeof OUTSTANDING_OPERATION_STATES)[number][] } },
    select: { id: true, title: true, state: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(r => ({ id: r.id, title: openText(r.title), state: r.state }))
}

/** A refusal the lead can say: the rule's own words, never an internal error's. */
function refused(tool: string, err: unknown): ToolCallOutcome {
  if (err instanceof HttpError && err.statusCode < 500) return { status: 'refused', reason: err.message }
  logger.error(`${tool} failed in a conversation`, err)
  return { status: 'refused', reason: `${tool} failed` }
}

/**
 * A typed message approves nothing through the lead: the lead may have been misled into reading a yes the person
 * never gave, or into naming a request they never saw. A person who types approves with the request's own Approve
 * button, which shows exactly what it allows. A spoken yes still counts, after a read-back (voice/readBack.ts), and a
 * no in words still declines.
 */
export const TYPED_APPROVAL_REFUSED =
  "A typed approval is not taken from your reply: the person approves with the request's Approve button, which shows exactly what it allows. Ask them to use it. Nothing was changed."

const answerInput = z.object({
  operationId: z.string().min(1).describe('The id of the waiting request, from the list in this tool\'s description.'),
  answer: z.enum(['approve', 'decline']),
  note: z.string().max(NOTE_MAX_CHARS).optional().describe('What the person said with their answer, if anything.'),
})

export const answerApprovalTool: ConversationTool = {
  name: ANSWER_APPROVAL,
  area: 'conversation',
  input: answerInput,
  async offered(capability) {
    if (!answersAPerson(capability)) return false
    return (await prisma.operation.count({ where: { conversationId: capability.conversationId, state: 'WAITING_FOR_APPROVAL' } })) > 0
  },
  async describe(capability) {
    const waiting = await listed(capability.conversationId, ['WAITING_FOR_APPROVAL'])
    return [
      'Answer a request waiting for the person\'s approval, when they answer it in words ("no, not on the shared',
      'machine", or a spoken "yes, go ahead"). Call it only on their clear answer to that request; read it back first',
      'if it is not clear which request they mean. Decline ends it, with their note. Approve runs the work, and counts',
      'only when they said yes aloud, after a read-back: when this asks for one, say it and wait for their yes, then',
      'call it again. A typed yes is not taken here: ask them to use the request\'s Approve button.',
      '',
      'Waiting for an answer:',
      ...waiting.map(w => `- ${w.id}: ${w.title}`),
    ].join('\n')
  },
  async run(capability, raw) {
    if (!answersAPerson(capability)) return { status: 'refused', reason: 'Only a reply to what the person said can answer for them' }
    const parsed = answerInput.safeParse(raw ?? {})
    if (!parsed.success) return { status: 'refused', reason: `The arguments do not fit ${ANSWER_APPROVAL}: ${parsed.error.issues.map(i => i.message).join('; ')}` }
    const { operationId, answer, note } = parsed.data
    try {
      await requireConversationSpeaker(capability.conversationId, capability.actingUserId)
      const transcript = await spokenInput(capability.turnId)
      if (transcript === null && answer === 'approve') return { status: 'refused', reason: TYPED_APPROVAL_REFUSED }
      if (transcript !== null && answer === 'approve') {
        const readBack = readBackFirst(operationId, capability.turnId, await operationTitle(operationId))
        if (readBack) return { status: 'done', operationId, result: { answered: null, readBackFirst: readBack } }
      }
      await answerRequest({
        conversationId: capability.conversationId, operationId, answer, note: note ?? null,
        answererId: capability.actingUserId, via: { kind: 'turn', turnId: capability.turnId },
        ...(transcript !== null ? { transcript } : {}),
      })
      return { status: 'done', operationId, result: { answered: answer } }
    } catch (err) {
      return refused(ANSWER_APPROVAL, err)
    }
  },
}

const cancelInput = z.object({
  operationId: z.string().min(1).describe('The id of the work to stop, from the list in this tool\'s description.'),
})

export const cancelOperationTool: ConversationTool = {
  name: CANCEL_OPERATION,
  area: 'conversation',
  input: cancelInput,
  async offered(capability) {
    if (!actsForAPerson(capability)) return false
    return (await prisma.operation.count({ where: { conversationId: capability.conversationId, state: { in: [...OUTSTANDING_OPERATION_STATES] } } })) > 0
  },
  async describe(capability) {
    const running = await listed(capability.conversationId, OUTSTANDING_OPERATION_STATES)
    return [
      'Stop work under way in this conversation, when the person asks you to. Started work is stopped where it runs;',
      'a task is only no longer followed here, and carries on as the project\'s.',
      '',
      'Under way:',
      ...running.map(r => `- ${r.id}: ${r.title} (${activityWord(r.state)})`),
    ].join('\n')
  },
  async run(capability, raw) {
    if (!actsForAPerson(capability)) return { status: 'refused', reason: 'This reply acts for no one, so it cannot stop anything' }
    const parsed = cancelInput.safeParse(raw ?? {})
    if (!parsed.success) return { status: 'refused', reason: `The arguments do not fit ${CANCEL_OPERATION}: ${parsed.error.issues.map(i => i.message).join('; ')}` }
    const { operationId } = parsed.data
    try {
      await requireConversationSpeaker(capability.conversationId, capability.actingUserId)
      const { stopped } = await stopOperation(capability.conversationId, operationId, capability.actingUserId)
      return { status: 'done', operationId, result: stopped ? { stopped: true } : { stopped: false, note: 'It had already ended.' } }
    } catch (err) {
      return refused(CANCEL_OPERATION, err)
    }
  },
}
