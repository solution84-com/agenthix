/**
 * A conversation's messages, in order (conversational experience spec, Data model). The only code that writes
 * or reads `ConversationMessage`: a body is sealed on the way in and opened only on the way out, so nothing
 * else ever sees the stored ciphertext or writes a body in the clear.
 *
 * Order is the conversation's own counter, `Conversation.lastSeq`. Each append takes the conversation's row
 * lock first, then checks the client's id, then raises the counter and inserts, all in one transaction — so
 * messages admitted at the same moment get distinct seqs with no gaps (a failed insert rolls the counter back
 * with it), and a message sent twice is stored once.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma, type ConversationMessage } from '@prisma/client'
import type { AppendMessage, AppendMessageInput, ReadMessages, UpdateMessage } from '../contract'
import type { ConversationMessageView } from '../../shared/conversations/protocol'
import { openJson, sealJson } from '../sealing'
import { pickedSkillOf, type PickedSkill } from '@agenthix/core'

export function toMessageView(row: ConversationMessage): ConversationMessageView {
  return {
    id: row.id,
    seq: row.seq,
    clientMessageId: row.clientMessageId,
    role: row.role,
    authorId: row.authorId,
    agentId: row.agentId,
    kind: row.kind,
    body: openJson(row.body),
    spoken: row.spoken,
    interrupted: row.interrupted,
    withdrawn: row.withdrawn,
    encouragement: row.encouragement,
    operationId: row.operationId,
    turnId: row.turnId,
    queueState: row.queueState,
    createdAt: row.createdAt.toISOString(),
  } as ConversationMessageView
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

/** `appendMessage` inside a transaction the caller already holds — starting a conversation writes its row and first message together. */
export async function appendMessageIn(
  tx: Prisma.TransactionClient,
  input: AppendMessageInput,
): Promise<{ message: ConversationMessageView; duplicate: boolean }> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Conversation" WHERE id = ${input.conversationId} FOR UPDATE`
  if (locked.length === 0) throw new HttpError(404, 'Conversation not found')

  const clientMessageId = input.clientMessageId ?? null
  if (clientMessageId !== null) {
    const stored = await tx.conversationMessage.findUnique({
      where: { conversationId_clientMessageId: { conversationId: input.conversationId, clientMessageId } },
    })
    if (stored) return { message: toMessageView(stored), duplicate: true }
  }

  const now = new Date()
  const { lastSeq } = await tx.conversation.update({
    where: { id: input.conversationId },
    data: { lastSeq: { increment: 1 }, lastMessageAt: now },
    select: { lastSeq: true },
  })
  // A person writing in an archived conversation opens it again (a completion does the same, in the mailbox).
  if (input.role === 'PERSON') {
    await tx.conversation.updateMany({ where: { id: input.conversationId, status: 'ARCHIVED' }, data: { status: 'ACTIVE', archivedAt: null } })
  }
  const row = await tx.conversationMessage.create({
    data: {
      conversationId: input.conversationId,
      seq: lastSeq,
      clientMessageId,
      role: input.role,
      kind: input.kind,
      body: sealJson(input.body),
      authorId: input.authorId ?? null,
      agentId: input.agentId ?? null,
      operationId: input.operationId ?? null,
      turnId: input.turnId ?? null,
      queueState: input.queueState ?? null,
      spoken: input.spoken ?? false,
      encouragement: input.encouragement ?? false,
      createdAt: now,
    },
  })
  return { message: toMessageView(row), duplicate: false }
}

export const appendMessage: AppendMessage = async (input) => {
  try {
    return await prisma.$transaction((tx) => appendMessageIn(tx, input))
  } catch (err) {
    // The row lock makes this unreachable for one conversation; kept so a duplicate can never surface as a 500.
    if (!isUniqueViolation(err) || !input.clientMessageId) throw err
    const stored = await prisma.conversationMessage.findUnique({
      where: { conversationId_clientMessageId: { conversationId: input.conversationId, clientMessageId: input.clientMessageId } },
    })
    if (!stored) throw err
    return { message: toMessageView(stored), duplicate: true }
  }
}

/** Newest first: up to `limit` messages before `beforeSeq`, or the latest when it is absent. */
export const readMessages: ReadMessages = async (conversationId, page) => {
  const rows = await prisma.conversationMessage.findMany({
    where: { conversationId, ...(page.beforeSeq !== undefined ? { seq: { lt: page.beforeSeq } } : {}) },
    orderBy: { seq: 'desc' },
    take: page.limit,
  })
  return rows.map(toMessageView)
}

export const updateMessage: UpdateMessage = async (messageId, patch) => {
  const row = await prisma.conversationMessage.update({
    where: { id: messageId },
    data: {
      ...(patch.queueState !== undefined && { queueState: patch.queueState }),
      ...(patch.turnId !== undefined && { turnId: patch.turnId }),
      ...(patch.interrupted !== undefined && { interrupted: patch.interrupted }),
      ...(patch.withdrawn !== undefined && { withdrawn: patch.withdrawn }),
    },
  })
  return toMessageView(row)
}

/** A person's message whose pictures a turn's model was not given, marked with that model's name once; null when it was already. */
export async function markUnseenBy(messageId: string, model: string): Promise<ConversationMessageView | null> {
  const row = await prisma.conversationMessage.findUnique({ where: { id: messageId } })
  if (!row || row.role !== 'PERSON' || row.kind !== 'TEXT') return null
  const body = openJson<Record<string, unknown>>(row.body)
  if (body.unseenBy) return null
  const updated = await prisma.conversationMessage.update({ where: { id: messageId }, data: { body: sealJson({ ...body, unseenBy: model }) } })
  return toMessageView(updated)
}

/**
 * A reply the person spoke over after it was written (voice): cut to what they heard, and marked interrupted;
 * `withdrawn` when their words joined the message it answered instead.
 */
export async function keepHeardText(messageId: string, text: string, withdrawn = false): Promise<ConversationMessageView> {
  const row = await prisma.conversationMessage.update({
    where: { id: messageId }, data: { body: sealJson({ text }), interrupted: true, ...(withdrawn && { withdrawn }) },
  })
  return toMessageView(row)
}

export interface JoinedWords {
  /** The message the words joined, now spoken and waiting to be answered again. */
  message: ConversationMessageView
  /** The other messages of theirs the cancelled reply had taken, given back to be answered with it. */
  returned: ConversationMessageView[]
  /** The turn holding the conversation now, if any. */
  busyWith: string | null
}

/**
 * The person spoke again before any of a reply was heard (voice): their words join the last message of theirs the
 * reply answers, marked spoken, and every message it took is given back untaken, so the whole is answered again
 * — waiting while a turn still holds the conversation. Null when that reply took no message of theirs, a later
 * reply has already been written, or the joined message would be too long.
 */
export async function joinSpokenWords(
  conversationId: string, userId: string, turnId: string, words: string, maxChars: number,
): Promise<JoinedWords | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`
    const taken = await tx.conversationMessage.findMany({
      where: { conversationId, turnId, role: 'PERSON', kind: { in: ['TEXT', 'APPROVAL_ANSWER'] } },
      orderBy: { seq: 'asc' },
    })
    const last = [...taken].reverse().find(m => m.kind === 'TEXT' && m.authorId === userId)
    if (!last) return null
    const later = await tx.conversationMessage.findFirst({
      // A reply withdrawn (its words joined, or an encouragement response they went on after) is not one that followed.
      where: { conversationId, seq: { gt: last.seq }, role: 'AGENT', turnId: { not: turnId }, NOT: { turnId: null }, withdrawn: false },
      select: { id: true },
    })
    if (later) return null
    const text = `${openJson<{ text: string }>(last.body).text} ${words}`
    if (text.length > maxChars) return null
    const row = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { activeTurnId: true, activeTurnLeaseUntil: true } })
    const busy = row.activeTurnId !== null && row.activeTurnLeaseUntil !== null && row.activeTurnLeaseUntil >= new Date()
    const queueState = busy ? 'WAITING' as const : null
    const joined = await tx.conversationMessage.update({ where: { id: last.id }, data: { body: sealJson({ text }), spoken: true, turnId: null, queueState } })
    const others = taken.filter(m => m.id !== last.id)
    const returned = await Promise.all(others.map(m => tx.conversationMessage.update({ where: { id: m.id }, data: { turnId: null, queueState } })))
    return { message: toMessageView(joined), returned: returned.map(toMessageView), busyWith: busy ? row.activeTurnId : null }
  })
}

/**
 * More words for a spoken message no turn has taken yet, since earlier words joined it (voice): they join it too, and
 * it is answered once, whole. Null when it is no longer waiting, or the joined message would be too long.
 */
export async function joinWaitingWords(
  conversationId: string, userId: string, messageId: string, words: string, maxChars: number,
): Promise<ConversationMessageView | null> {
  return prisma.$transaction(async (tx) => {
    // Under the row lock the claim takes, so the words are in the message before any turn takes it, or not at all.
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`
    const row = await tx.conversationMessage.findFirst({
      where: { id: messageId, conversationId, role: 'PERSON', kind: 'TEXT', authorId: userId, turnId: null, OR: [{ queueState: null }, { queueState: 'WAITING' }] },
    })
    if (!row) return null
    const text = `${openJson<{ text: string }>(row.body).text} ${words}`
    if (text.length > maxChars) return null
    return toMessageView(await tx.conversationMessage.update({ where: { id: row.id }, data: { body: sealJson({ text }), spoken: true } }))
  })
}

/** The reply a turn wrote, when it was an encouragement response (voice, active listening); null otherwise. */
export async function readEncouragement(conversationId: string, turnId: string): Promise<ConversationMessageView | null> {
  const row = await prisma.conversationMessage.findFirst({ where: { conversationId, turnId, role: 'AGENT', kind: 'TEXT', encouragement: true } })
  return row ? toMessageView(row) : null
}

/** A person's messages still waiting for the running reply to end, oldest first. */
export async function readWaitingMessages(conversationId: string): Promise<ConversationMessageView[]> {
  const rows = await prisma.conversationMessage.findMany({
    where: { conversationId, queueState: 'WAITING' },
    orderBy: { seq: 'asc' },
  })
  return rows.map(toMessageView)
}

/** The skill picked with `/` for the newest of a turn's person messages that picked one (work/pickedSkill.ts), or null. */
export async function readPickedSkillOfTurn(turnId: string): Promise<PickedSkill | null> {
  const rows = await prisma.conversationMessage.findMany({
    where: { turnId, role: 'PERSON', kind: 'TEXT' },
    orderBy: { seq: 'desc' },
    select: { body: true },
  })
  for (const row of rows) {
    const skill = pickedSkillOf(openJson<{ skill?: unknown }>(row.body).skill)
    if (skill) return skill
  }
  return null
}
