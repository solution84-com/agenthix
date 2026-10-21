/**
 * What the conversation says about its access (model access spec), against the real test database: with no key,
 * the problem shows before anything is sent; when the provider refused the key on the latest turn, the problem and
 * an offer that leaves that key out show, and switching moves the conversation off it once.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createConversation, createUserWithRole } from '../../../test/factories'
import { orgKey, storeKey } from '../../../model-access/__tests__/runCredentialFixtures'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scheduler')>()),
  scheduleConversation: vi.fn(),
}))

import { getConversation } from '../../conversationQueries'
import { switchConversationAccess } from '../../switchAccess'
import { latestRefusal } from '../refusal'

const SONNET = 'claude-sonnet-5'
const ctx = (user: { id: string }) => ({ user })

async function talkingOnOwnKey() {
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent({ defaultModel: SONNET, runtime: 'claude-sdk' })
  const conversation = await createConversation({
    openedById: person.id, agentId: agent.id,
    talkingModel: SONNET, talkingProvider: 'anthropic', accessOwnerType: 'user', accessKind: 'API_KEY',
  })
  await storeKey('user', person.id, 'mine')
  await orgKey('anthropic', 'org-key')
  return { person, conversation }
}

async function failedTurn(conversationId: string, errorKind: string) {
  await prisma.inferenceTurn.create({
    data: { conversationId, trigger: 'MESSAGE', state: 'FAILED', error: 'refused', errorKind, startedAt: new Date(), endedAt: new Date() },
  })
}

describe("the conversation's access on screen @SC-952", () => {
  it('says what is missing before anything is sent, when no key reaches a model', async () => {
    const person = await createUserWithRole('MEMBER')
    const conversation = await createConversation({ openedById: person.id })
    const view = await getConversation({ conversationId: conversation.id }, ctx(person))
    expect(view.accessProblem).toContain('API key')
    expect(view.accessOffer).toBeNull()
  })

  it('shows nothing while the key it talks on works', async () => {
    const { person, conversation } = await talkingOnOwnKey()
    const view = await getConversation({ conversationId: conversation.id }, ctx(person))
    expect(view).toMatchObject({ accessProblem: null, accessOffer: null })
  })

  it('after the provider refused the key, shows the problem and an offer that leaves that key out', async () => {
    const { person, conversation } = await talkingOnOwnKey()
    await failedTurn(conversation.id, 'auth')

    expect(await latestRefusal(conversation.id)).toEqual({ owner: 'user', provider: 'anthropic' })
    const view = await getConversation({ conversationId: conversation.id }, ctx(person))
    expect(view.accessProblem).toMatch(/^Anthropic refused your own Anthropic key/)
    expect(view.accessOffer).toEqual({ label: "Claude Sonnet 5, on the organisation's Anthropic key" })
  })

  it('a turn failed for another reason is no refusal', async () => {
    const { conversation } = await talkingOnOwnKey()
    await failedTurn(conversation.id, 'rate-limit')
    expect(await latestRefusal(conversation.id)).toBeNull()
  })

  it('switching moves it off the refused key once, and the refusal is then behind it', async () => {
    const { person, conversation } = await talkingOnOwnKey()
    await failedTurn(conversation.id, 'auth')

    await switchConversationAccess({ conversationId: conversation.id }, ctx(person))

    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })
    expect(row).toMatchObject({ talkingModel: SONNET, talkingProvider: 'anthropic', accessOwnerType: 'org' })
    expect(await latestRefusal(conversation.id)).toBeNull()
    await expect(switchConversationAccess({ conversationId: conversation.id }, ctx(person))).rejects.toMatchObject({ statusCode: 409 })
  })
})
