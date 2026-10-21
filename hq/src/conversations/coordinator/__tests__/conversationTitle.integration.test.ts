/**
 * A conversation's title, named after its first reply, against the real test database: the model is asked with the
 * person's first message and the reply, and what it names is kept only where there was no title.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createConversation, createUserWithRole } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { appendMessage } from '../../store/messages'
import { turnDeps } from '../scheduler'

const access = { provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'k', owner: 'user', kind: 'API_KEY' } as never
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }

afterEach(() => vi.restoreAllMocks())

async function asked(title: string | null = null) {
  const person = await createUserWithRole('MEMBER')
  const conversation = await createConversation({ openedById: person.id })
  if (title) await prisma.conversation.update({ where: { id: conversation.id }, data: { title } })
  await appendMessage({ conversationId: conversation.id, role: 'PERSON', kind: 'TEXT', body: { text: 'plan the launch' }, authorId: person.id, clientMessageId: 'c1' })
  return conversation
}
const titleOf = async (id: string) => (await prisma.conversation.findUniqueOrThrow({ where: { id } })).title

describe('a conversation\'s title', () => {
  it('is named by the model from the first message and the reply', async () => {
    const complete = vi.spyOn(turnDeps.model, 'complete').mockResolvedValue({ text: 'The launch plan', usage })
    const conversation = await asked()
    await turnDeps.titleConversation!(conversation.id, access, 'Let us plan it.')
    expect(await titleOf(conversation.id)).toBe('The launch plan')
    expect(JSON.stringify(complete.mock.calls[0]![0].messages)).toContain('plan the launch')
  })

  it('is left as it was when the conversation has one, without asking', async () => {
    const complete = vi.spyOn(turnDeps.model, 'complete').mockResolvedValue({ text: 'Something else', usage })
    const conversation = await asked('Mine')
    await turnDeps.titleConversation!(conversation.id, access, 'Let us plan it.')
    expect(await titleOf(conversation.id)).toBe('Mine')
    expect(complete).not.toHaveBeenCalled()
  })
})
