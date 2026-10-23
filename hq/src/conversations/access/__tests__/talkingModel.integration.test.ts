/**
 * A conversation whose model's provider stops working (models from one place, part 1, *When a provider fails*),
 * against the real test database: the view says why and makes one offer, the same model via another provider; taking
 * it switches the conversation with *Switched to …* and sends the failed message again; nothing switches without the
 * person, and a provider that comes back switches nobody back.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createConversation, createUserWithRole } from '../../../test/factories'
import { createProvider, setOrgDefaults } from '../../../routing/__tests__/routingFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../coordinator/scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../coordinator/scheduler')>()),
  scheduleConversation: vi.fn(),
}))

import { getConversation } from '../../conversationQueries'
import { switchConversationAccess } from '../../switchAccess'

const SONNET = 'claude-sonnet-4-5'
const ctx = (user: { id: string }) => ({ user })

async function talkingOnAnthropic() {
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent()
  const anthropic = await createProvider({ vendor: 'anthropic', name: 'Anthropic' })
  const openrouter = await createProvider({ vendor: 'openrouter', name: 'OpenRouter' })
  await setOrgDefaults({ conversation: { providerId: anthropic.id, model: SONNET } })
  const conversation = await createConversation({ openedById: person.id, agentId: agent.id, talkingModel: SONNET, talkingProviderId: anthropic.id })
  return { person, conversation, anthropic, openrouter }
}

/** A turn that failed on the person's message, as the coordinator leaves it. */
async function failedTurn(conversationId: string, authorId: string) {
  const turn = await prisma.inferenceTurn.create({
    data: { conversationId, trigger: 'MESSAGE', state: 'FAILED', error: 'refused', errorKind: 'auth', startedAt: new Date(), endedAt: new Date() },
  })
  const message = await prisma.conversationMessage.create({
    data: { conversationId, seq: 1, role: 'PERSON', kind: 'TEXT', body: 'sealed', authorId, turnId: turn.id },
  })
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastSeq: 1 } })
  return { turn, message }
}

describe('a conversation on a provider that is not working @SC-952', () => {
  it('shows nothing while its provider works', async () => {
    const { person, conversation } = await talkingOnAnthropic()
    expect(await getConversation({ conversationId: conversation.id }, ctx(person))).toMatchObject({ accessProblem: null, accessOffer: null })
  })

  it('says why, that an organisation admin has been told, and offers the same model via another provider', async () => {
    const { person, conversation, anthropic } = await talkingOnAnthropic()
    await prisma.aiProvider.update({ where: { id: anthropic.id }, data: { state: 'key_refused' } })
    const view = await getConversation({ conversationId: conversation.id }, ctx(person))
    expect(view.accessProblem).toMatch(/An organisation admin has been told/)
    expect(view.accessOffer?.label).toMatch(/via OpenRouter/)
  })

  it('switches only when the person takes the offer, writes the notice and sends the failed message again', async () => {
    const { person, conversation, anthropic, openrouter } = await talkingOnAnthropic()
    const { message } = await failedTurn(conversation.id, person.id)
    await prisma.aiProvider.update({ where: { id: anthropic.id }, data: { state: 'key_refused' } })
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).toMatchObject({ talkingProviderId: anthropic.id })

    await switchConversationAccess({ conversationId: conversation.id }, ctx(person))

    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).toMatchObject({ talkingProviderId: openrouter.id, talkingModel: 'anthropic/claude-sonnet-4.5' })
    const notice = await prisma.conversationMessage.findFirst({ where: { conversationId: conversation.id, kind: 'NOTICE' } })
    expect(notice).not.toBeNull()
    expect(await prisma.conversationMessage.findUniqueOrThrow({ where: { id: message.id } })).toMatchObject({ turnId: null })

    // Its provider coming back switches nobody back.
    await prisma.aiProvider.update({ where: { id: anthropic.id }, data: { state: 'works' } })
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).toMatchObject({ talkingProviderId: openrouter.id })
  })

  it('refuses to switch while the model it talks on works', async () => {
    const { person, conversation } = await talkingOnAnthropic()
    await expect(switchConversationAccess({ conversationId: conversation.id }, ctx(person))).rejects.toMatchObject({ statusCode: 409 })
  })
})
