/**
 * Starting a conversation (conversational experience spec, Who a person talks to): typing in a person's own
 * space or in a project starts a new conversation with the person's primary agent, or with another of the home's
 * agents chosen before the first message, on the talking model picked then if one was. The conversation and its
 * first message are stored together; the same
 * first message sent twice — a retry after a dropped connection — starts one conversation. Started for voice, from
 * the voice button of an empty box, it has no message yet: what the person says becomes its first.
 */
import { HttpError, prisma } from 'wasp/server'
import {
  MESSAGE_MAX_CHARS,
  type StartConversationArgs,
  type StartConversationResult,
} from '../shared/conversations/protocol'
import { agentChoicesFor } from './primaryAgent'
import { appendMessageIn } from './store/messages'
import { afterMessageAdmitted } from './afterAdmission'
import { requireOfferedModel } from './modelChoice'

type Ctx = { user?: { id: string } | null }

/** The longest client message id taken: a UUID, with room to spare. */
const CLIENT_ID_MAX = 100

function requireMessage(args: StartConversationArgs): { text: string; clientMessageId: string } {
  const text = typeof args?.text === 'string' ? args.text.trim() : ''
  if (text === '' && args?.voice !== true) throw new HttpError(400, 'Write a message to start the conversation')
  if (text.length > MESSAGE_MAX_CHARS) throw new HttpError(400, `A message can be at most ${MESSAGE_MAX_CHARS} characters`)
  const clientMessageId = args.clientMessageId
  if (typeof clientMessageId !== 'string' || clientMessageId === '' || clientMessageId.length > CLIENT_ID_MAX) {
    throw new HttpError(400, 'A message needs the id its client gave it')
  }
  return { text, clientMessageId }
}

export const startConversation = async (args: StartConversationArgs, context: Ctx): Promise<StartConversationResult> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const { text, clientMessageId } = requireMessage(args)

  const sentBefore = text && await prisma.conversationMessage.findFirst({
    where: { clientMessageId, authorId: userId, seq: 1, conversation: { openedById: userId } },
    select: { id: true, conversationId: true },
  })
  if (sentBefore) return { conversationId: sentBefore.conversationId, messageId: sentBefore.id }

  const choices = await agentChoicesFor({ home: args.home, projectId: args.projectId }, userId)
  const agentId = args.agentId ?? choices[0]?.id
  if (!agentId) throw new HttpError(409, args.home === 'PROJECT' ? 'Add an agent to this project to talk to it' : 'There is no agent to talk to yet')
  if (!choices.some(a => a.id === agentId)) throw new HttpError(400, 'That agent cannot be talked to here')
  const projectId = args.home === 'PROJECT' ? args.projectId! : null
  // A model picked before the first message is checked against what the home offers now, as a later change is.
  const talking = args.model === undefined ? null : (await requireOfferedModel(
    { id: '', home: args.home, projectId, taskId: null, openedById: userId, agentId }, args.model, userId,
  )).choice

  const { conversationId, message } = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        home: args.home,
        projectId,
        openedById: userId,
        agentId,
        ...(talking && { talkingModel: talking.model, talkingProviderId: talking.providerId }),
      },
      select: { id: true },
    })
    if (!text) return { conversationId: conversation.id, message: null }
    const { message } = await appendMessageIn(tx, {
      conversationId: conversation.id,
      role: 'PERSON',
      kind: 'TEXT',
      body: { text },
      authorId: userId,
      clientMessageId,
    })
    return { conversationId: conversation.id, message }
  })

  if (!message) return { conversationId, messageId: null }
  await afterMessageAdmitted(conversationId, message)
  return { conversationId, messageId: message.id }
}
