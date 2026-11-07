/**
 * The model picker's server side (models from one place, part 4), against the real test database: the models offered
 * are those the resolver lets the conversation run — providers that work, narrowed by the lists that apply — each a
 * model via a provider; a pick is checked again on the server, and a change is one quiet line.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createConversation, createUserWithRole } from '../../test/factories'
import { createProvider, setList, setOrgDefaults } from '../../routing/__tests__/routingFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../coordinator/scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../coordinator/scheduler')>()),
  scheduleConversation: vi.fn(),
}))

import { getModelChoices, setConversationModel } from '../modelChoice'
import { startConversation } from '../startConversation'
import { choiceValue } from '../access/talkingModel'

const SONNET = 'claude-sonnet-5'
const ctx = (user: { id: string }) => ({ user })

async function world() {
  await createAgent({ name: 'Kernel', handle: 'kernel', isKernel: true })
  const anthropic = await createProvider({ vendor: 'anthropic', name: 'Anthropic' })
  const openrouter = await createProvider({ vendor: 'openrouter', name: 'OpenRouter' })
  await setOrgDefaults({ conversation: { providerId: anthropic.id, model: SONNET } })
  return { me: await createUserWithRole('MEMBER'), anthropic, openrouter }
}

const values = (choices: { value: string }[]) => choices.map(c => c.value)

describe('the models offered @SC-953 @SC-1198', () => {
  it('are every model via a provider that works, each with where it comes from, the default first chosen', async () => {
    const { me, anthropic, openrouter } = await world()
    const choices = await getModelChoices({ home: 'PERSON' }, ctx(me))
    const sonnet = choiceValue({ providerId: anthropic.id, model: SONNET })
    const viaOpenRouter = choiceValue({ providerId: openrouter.id, model: 'anthropic/claude-sonnet-5' })
    expect(values(choices.models)).toEqual(expect.arrayContaining([sonnet, viaOpenRouter]))
    expect(choices.models.find(m => m.value === sonnet)).toMatchObject({ label: 'Claude Sonnet 5', maker: 'Anthropic', via: 'via Anthropic' })
    expect(choices.models.find(m => m.value === viaOpenRouter)).toMatchObject({ maker: 'Anthropic', via: 'via OpenRouter' })
    expect(choices.current).toBe(sonnet)
    expect(values(choices.recommended ?? [])).toEqual([sonnet])
  })

  it('keeps a provider that is not working listed and marked, and leaves out what a list cuts', async () => {
    const { me, anthropic } = await world()
    await prisma.aiProvider.update({ where: { id: anthropic.id }, data: { state: 'key_refused' } })
    await setList('organisation', 'org', 'every', [{ effect: 'never', pattern: 'deepseek/*' }])
    const offered = (await getModelChoices({ home: 'PERSON' }, ctx(me))).models
    const viaAnthropic = offered.filter(m => m.value.startsWith(`${anthropic.id}/`))
    expect(viaAnthropic.length).toBeGreaterThan(0)
    expect(viaAnthropic.every(m => m.notWorking === true)).toBe(true)
    expect(offered.some(m => m.maker === 'DeepSeek')).toBe(false)
  })

  it('refuses a pick via a provider that is not working', async () => {
    const { me, anthropic } = await world()
    const conversation = await createConversation({ openedById: me.id })
    await prisma.aiProvider.update({ where: { id: anthropic.id }, data: { state: 'key_refused' } })
    await expect(setConversationModel({ conversationId: conversation.id, model: `${anthropic.id}/${SONNET}` }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('picking a model', () => {
  it('switches the conversation with one quiet line, and refuses what is not offered', async () => {
    const { me, anthropic, openrouter } = await world()
    const conversation = await createConversation({ openedById: me.id, talkingModel: SONNET, talkingProviderId: anthropic.id })
    const pick = choiceValue({ providerId: openrouter.id, model: 'openai/gpt-4.1' })
    await setConversationModel({ conversationId: conversation.id, model: pick }, ctx(me))
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).toMatchObject({ talkingProviderId: openrouter.id, talkingModel: 'openai/gpt-4.1' })
    const notice = await prisma.conversationMessage.findFirst({ where: { conversationId: conversation.id, kind: 'NOTICE' } })
    expect(notice).not.toBeNull()

    await expect(setConversationModel({ conversationId: conversation.id, model: `${anthropic.id}/not-a-model` }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('fixes a model picked before the first message', async () => {
    const { me, openrouter } = await world()
    const pick = choiceValue({ providerId: openrouter.id, model: 'openai/gpt-4.1' })
    const { conversationId } = await startConversation({ home: 'PERSON', text: 'Hello', clientMessageId: 'c1', model: pick }, ctx(me))
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).toMatchObject({ talkingProviderId: openrouter.id, talkingModel: 'openai/gpt-4.1' })
  })
})
