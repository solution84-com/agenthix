/**
 * The model picker's server side (model access and policy spec, *The person keeps one knob*), against the real
 * test database: the models offered are those the person's access reaches within the policy, a pick is checked
 * again on the server, a change is one quiet line, and a model policy's form is offered models bounded by the
 * layer above it.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import {
  createAgent, createConversation, createProject, createUserWithRole, joinProjectAs,
} from '../../test/factories'
import { orgKey, storeKey } from '../../model-access/__tests__/runCredentialFixtures'

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
import { resolveConversationAccess } from '../access/conversationAccess'

const SONNET = 'claude-sonnet-5'
const OPUS = 'claude-opus-5'
const OR_SONNET = 'openrouter/anthropic/claude-sonnet-5'
const GPT = 'openai/gpt-4.1'
const ctx = (user: { id: string }) => ({ user })

async function person() {
  await createAgent({ name: 'Kernel', handle: 'kernel', isKernel: true, defaultModel: SONNET })
  return createUserWithRole('MEMBER')
}

const values = (choices: { value: string }[]) => choices.map(c => c.value)

describe('the models offered @SC-953', () => {
  it("are those the person's keys reach, grouped by maker, each with where it comes from and a price hint", async () => {
    const me = await person()
    await storeKey('user', me.id, 'mine')
    await orgKey('openrouter', 'org-openrouter')
    const choices = await getModelChoices({ home: 'PERSON' }, ctx(me))
    expect(values(choices.models)).toEqual(expect.arrayContaining([SONNET, OPUS, OR_SONNET]))
    expect(values(choices.models)).not.toContain(GPT)
    expect(choices.models.find(m => m.value === SONNET)).toEqual({ value: SONNET, label: 'Claude Sonnet 5', maker: 'Anthropic', via: 'via Anthropic', price: 2 })
    expect(choices.models.find(m => m.value === OR_SONNET)).toMatchObject({ maker: 'Anthropic', via: 'via OpenRouter' })
    expect(choices.models.find(m => m.value === 'openrouter/deepseek/deepseek-v3.2')).toMatchObject({ maker: 'DeepSeek' })
    expect(choices.current).toBe(SONNET)
  })

  it("are within the policy's allow-list and ceiling", async () => {
    const me = await person()
    await storeKey('user', me.id, 'mine')
    await prisma.modelPolicy.create({ data: { ownerType: 'org', ownerId: 'org', ceiling: SONNET } })
    const choices = values((await getModelChoices({ home: 'PERSON' }, ctx(me))).models)
    expect(choices).toContain(SONNET)
    expect(choices).not.toContain(OPUS)
  })

  it('default to the policy\'s talking model through another access when none reaches it directly', async () => {
    const me = await person()
    await orgKey('openrouter', 'org-openrouter')
    expect((await getModelChoices({ home: 'PERSON' }, ctx(me))).current).toBe(OR_SONNET)
  })

  it("put the person's recent models first, newest first, at most three, only those offered now", async () => {
    const me = await person()
    await storeKey('user', me.id, 'mine')
    const at = (s: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, s))
    for (const [model, s] of [[OPUS, 1], ['claude-haiku-4-5', 2], [SONNET, 3], [GPT, 4], [SONNET, 5]] as const) {
      await createConversation({ openedById: me.id, talkingModel: model, lastMessageAt: at(s) })
    }
    const { recent } = await getModelChoices({ home: 'PERSON' }, ctx(me))
    expect(values(recent)).toEqual([SONNET, 'claude-haiku-4-5', OPUS])
  })

  it("are refused for a conversation the person may not read, and for a project they are not on", async () => {
    const me = await person()
    const other = await createUserWithRole('MEMBER')
    const theirs = await createConversation({ openedById: other.id })
    await expect(getModelChoices({ conversationId: theirs.id }, ctx(me))).rejects.toMatchObject({ statusCode: 404 })
    const project = await createProject()
    await expect(getModelChoices({ home: 'PROJECT', projectId: project.id }, ctx(me))).rejects.toMatchObject({ statusCode: 404 })
  })

  it("show the conversation's model, and nothing to pick for someone who may not speak in it", async () => {
    const me = await person()
    await storeKey('user', me.id, 'mine')
    const mine = await createConversation({ openedById: me.id, talkingModel: OPUS, talkingProvider: 'anthropic' })
    expect((await getModelChoices({ conversationId: mine.id }, ctx(me))).current).toBe(OPUS)
    await prisma.conversation.update({ where: { id: mine.id }, data: { status: 'CLOSED' } })
    expect(await getModelChoices({ conversationId: mine.id }, ctx(me))).toEqual({ current: OPUS, recent: [], models: [] })
  })
})

describe('changing a conversation\'s model @SC-953', () => {
  it('sets the talking model, provider and access, and writes one quiet line', async () => {
    const me = await person()
    await storeKey('user', me.id, 'mine')
    await orgKey('openrouter', 'org-openrouter')
    const c = await createConversation({ openedById: me.id, talkingModel: SONNET, talkingProvider: 'anthropic', accessOwnerType: 'user', accessKind: 'API_KEY' })
    await setConversationModel({ conversationId: c.id, model: OR_SONNET }, ctx(me))
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      talkingModel: OR_SONNET, talkingProvider: 'openrouter', accessOwnerType: 'org', accessKind: 'API_KEY',
    })
    const notices = await prisma.conversationMessage.findMany({ where: { conversationId: c.id, kind: 'NOTICE' } })
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ role: 'PLATFORM', authorId: me.id })
  })

  it("records the route picked, and the conversation's turns pay with it though the person later adds a key", async () => {
    const me = await person()
    await orgKey('anthropic', 'org-key')
    const c = await createConversation({ openedById: me.id, talkingModel: SONNET, talkingProvider: 'anthropic', accessOwnerType: 'org', accessKind: 'API_KEY' })
    await setConversationModel({ conversationId: c.id, model: OPUS }, ctx(me))
    await storeKey('user', me.id, 'mine')
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: c.id } })
    expect(row).toMatchObject({ talkingModel: OPUS, accessOwnerType: 'org' })
    const ref = { id: c.id, home: 'PERSON' as const, projectId: null, taskId: null, openedById: me.id, agentId: row.agentId }
    const fixed = { model: OPUS, provider: 'anthropic' as const, owner: row.accessOwnerType! }
    expect((await resolveConversationAccess(ref, fixed)).access).toMatchObject({ owner: 'org', apiKey: 'org-key', model: OPUS })
  })

  it('refuses a model the access or the policy does not offer, whatever the client sends', async () => {
    const me = await person()
    await storeKey('user', me.id, 'mine')
    await prisma.modelPolicy.create({ data: { ownerType: 'user', ownerId: me.id, ceiling: SONNET } })
    const c = await createConversation({ openedById: me.id, talkingModel: SONNET, talkingProvider: 'anthropic' })
    await expect(setConversationModel({ conversationId: c.id, model: GPT }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(setConversationModel({ conversationId: c.id, model: OPUS }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: c.id } })).talkingModel).toBe(SONNET)
  })

  it("is refused to someone who may not speak in it: another person's, a closed one, a project Viewer", async () => {
    const me = await person()
    await storeKey('user', me.id, 'mine')
    const other = await createUserWithRole('MEMBER')
    const theirs = await createConversation({ openedById: other.id })
    await expect(setConversationModel({ conversationId: theirs.id, model: OPUS }, ctx(me))).rejects.toMatchObject({ statusCode: 404 })
    const closed = await createConversation({ openedById: me.id, status: 'CLOSED' })
    await expect(setConversationModel({ conversationId: closed.id, model: OPUS }, ctx(me))).rejects.toMatchObject({ statusCode: 409 })
    const project = await createProject()
    await joinProjectAs(project.id, me.id, 'VIEWER')
    const viewing = await createConversation({ openedById: me.id, home: 'PROJECT', projectId: project.id })
    await expect(setConversationModel({ conversationId: viewing.id, model: OPUS }, ctx(me))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('takes the model picked before the first message, and refuses one not offered', async () => {
    const me = await person()
    await storeKey('user', me.id, 'mine')
    const { conversationId } = await startConversation({ home: 'PERSON', clientMessageId: 'a', text: 'Hi', model: OPUS }, ctx(me))
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).toMatchObject({
      talkingModel: OPUS, talkingProvider: 'anthropic', accessOwnerType: 'user',
    })
    await expect(startConversation({ home: 'PERSON', clientMessageId: 'b', text: 'Hi', model: GPT }, ctx(me)))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})

describe("a model policy's form @SC-954", () => {
  it("is offered the organisation's keys alone for the organisation's, to an org admin only, unbounded by its own policy", async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    await storeKey('user', admin.id, 'admins-own', { provider: 'openai' })
    await orgKey('anthropic', 'org-key')
    await prisma.modelPolicy.create({ data: { ownerType: 'org', ownerId: 'org', ceiling: SONNET } })
    const choices = values((await getModelChoices({ policyScope: 'org' }, ctx(admin))).models)
    expect(choices).toContain(OPUS)
    expect(choices).not.toContain(GPT)
    await expect(getModelChoices({ policyScope: 'org' }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
  })

  it("is bounded by the organisation's limits for a person's own, not by the policy being edited", async () => {
    const me = await createUserWithRole('MEMBER')
    await storeKey('user', me.id, 'mine')
    await prisma.modelPolicy.create({ data: { ownerType: 'org', ownerId: 'org', ceiling: OPUS } })
    await prisma.modelPolicy.create({ data: { ownerType: 'user', ownerId: me.id, ceiling: 'claude-haiku-4-5' } })
    const choices = values((await getModelChoices({ policyScope: 'user' }, ctx(me))).models)
    expect(choices).toEqual(expect.arrayContaining([SONNET, OPUS]))
    expect(choices).not.toContain('claude-fable-5')
  })

  it("for a project's, is for its members only", async () => {
    const me = await createUserWithRole('MEMBER')
    const project = await createProject()
    await expect(getModelChoices({ policyScope: 'project', projectId: project.id }, ctx(me))).rejects.toMatchObject({ statusCode: 403 })
    await joinProjectAs(project.id, me.id, 'MEMBER')
    await expect(getModelChoices({ policyScope: 'project', projectId: project.id }, ctx(me))).resolves.toMatchObject({ current: null })
  })
})
