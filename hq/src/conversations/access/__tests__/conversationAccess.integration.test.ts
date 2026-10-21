/**
 * Which access pays for a conversation's turn, by its home, and the talking model chosen at open (model access
 * and policy spec), against the real test database.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { resolveConversationAccess } from '../conversationAccess'
import type { ConversationHomeRef } from '../../contract'
import { createAgent, createProject, createTestTask, createUser } from '../../../test/factories'
import { storeKey, storeSubscription, orgKey } from '../../../model-access/__tests__/runCredentialFixtures'

const SONNET = 'claude-sonnet-5'
const GPT = 'openai/gpt-4.1'

let personId: string
let agentId: string

beforeEach(async () => {
  personId = (await createUser()).id
  agentId = (await createAgent({ defaultModel: SONNET, runtime: 'claude-sdk' })).id
})

const ref = (home: ConversationHomeRef['home'], extra: Partial<ConversationHomeRef> = {}): ConversationHomeRef => ({
  id: 'c1', home, projectId: null, taskId: null, openedById: personId, agentId, ...extra,
})

const paidBy = (owner: string, apiKey: string, model = SONNET, provider = 'anthropic') =>
  expect.objectContaining({ access: { provider, model, apiKey, owner, kind: 'API_KEY' }, problem: null })

describe("a person's own conversation @SC-951", () => {
  it("is paid for by the person's key, then the organisation's", async () => {
    await orgKey('anthropic', 'org-key')
    await expect(resolveConversationAccess(ref('PERSON'), null)).resolves.toEqual(paidBy('org', 'org-key'))
    await storeKey('user', personId, 'mine')
    await expect(resolveConversationAccess(ref('PERSON'), null)).resolves.toEqual(paidBy('user', 'mine'))
  })

  it("never uses a subscription, and says what is missing and where to add it", async () => {
    await storeSubscription('user', personId)
    await storeSubscription('org', 'org')
    const result = await resolveConversationAccess(ref('PERSON'), null)
    expect(result.access).toBeNull()
    expect(result.offer).toBeNull()
    expect(result.problem).toContain('an Anthropic API key')
    expect(result.problem).toContain('Settings › Your model logins')
    expect(result.problem).toContain('A Claude subscription is used for work, not for conversations')
  })
})

describe('a project conversation @SC-951', () => {
  it("is paid for by the project's key, then the person's, then the organisation's", async () => {
    const project = await createProject()
    const home = ref('PROJECT', { projectId: project.id })
    await orgKey('anthropic', 'org-key')
    await expect(resolveConversationAccess(home, null)).resolves.toEqual(paidBy('org', 'org-key'))
    await storeKey('user', personId, 'mine')
    await expect(resolveConversationAccess(home, null)).resolves.toEqual(paidBy('user', 'mine'))
    await storeKey('project', project.id, 'project-key')
    await expect(resolveConversationAccess(home, null)).resolves.toEqual(paidBy('project', 'project-key'))
  })

  it("never uses another person's key", async () => {
    const project = await createProject()
    const other = await createUser()
    await storeKey('user', other.id, 'theirs')
    const result = await resolveConversationAccess(ref('PROJECT', { projectId: project.id }), null)
    expect(result.access).toBeNull()
    expect(result.problem).toContain("ask a project admin to add an Anthropic API key on the project's settings")
  })
})

describe("a task's thread @SC-951", () => {
  it("is paid for by the project's key, then the organisation's, never the person's", async () => {
    const project = await createProject()
    const task = await createTestTask({ data: { title: 'T', number: 1, projectId: project.id, assignedAgentId: agentId, onBehalfOfUserId: personId } })
    const home = ref('TASK', { taskId: task.id, agentId: null })
    await storeKey('user', personId, 'mine')

    const none = await resolveConversationAccess(home, null)
    expect(none.access).toBeNull()
    expect(none.problem).toMatch(/^Task threads need a key on the project/)

    await orgKey('anthropic', 'org-key')
    await expect(resolveConversationAccess(home, null)).resolves.toEqual(paidBy('org', 'org-key'))
    await storeKey('project', project.id, 'project-key')
    await expect(resolveConversationAccess(home, null)).resolves.toEqual(paidBy('project', 'project-key'))
  })

  it("talks on the project policy's talking model", async () => {
    const project = await createProject()
    const task = await createTestTask({ data: { title: 'T', number: 1, projectId: project.id, assignedAgentId: agentId, onBehalfOfUserId: personId } })
    await prisma.modelPolicy.create({ data: { ownerType: 'project', ownerId: project.id, talking: GPT } })
    await storeKey('project', project.id, 'project-openai', { provider: 'openai' })
    await expect(resolveConversationAccess(ref('TASK', { taskId: task.id, agentId: null }), null))
      .resolves.toEqual(paidBy('project', 'project-openai', GPT, 'openai'))
  })
})

describe('the talking model, chosen at open @SC-951', () => {
  it("is the agent's default model where no policy says", async () => {
    await storeKey('user', personId, 'mine')
    const result = await resolveConversationAccess(ref('PERSON'), null)
    expect(result.access?.model).toBe(SONNET)
    expect(result.notice).toBeUndefined()
  })

  it("is the policy's talking model, the person's own over the organisation's", async () => {
    await prisma.modelPolicy.create({ data: { ownerType: 'org', ownerId: 'org', talking: 'claude-haiku-4-5' } })
    await storeKey('user', personId, 'mine', { provider: 'openai' })
    await storeKey('user', personId, 'mine-anthropic')
    expect((await resolveConversationAccess(ref('PERSON'), null)).access?.model).toBe('claude-haiku-4-5')
    await prisma.modelPolicy.create({ data: { ownerType: 'user', ownerId: personId, talking: GPT } })
    await expect(resolveConversationAccess(ref('PERSON'), null)).resolves.toEqual(paidBy('user', 'mine', GPT, 'openai'))
  })

  it('falls to the next model the policy allows when nobody reaches the preferred one, and says so once', async () => {
    await prisma.modelPolicy.create({
      data: { ownerType: 'user', ownerId: personId, talking: SONNET, allowed: [SONNET, GPT] },
    })
    await storeKey('user', personId, 'mine', { provider: 'openai' })
    const result = await resolveConversationAccess(ref('PERSON'), null)
    expect(result.access).toMatchObject({ provider: 'openai', model: GPT, owner: 'user' })
    expect(result.notice).toBe(
      "Claude Sonnet 5 isn't available with the model access here, so this conversation talks on GPT-4.1, on your own OpenAI key.",
    )
  })

  it('reaches the preferred model through another access before falling to the next, and says nothing', async () => {
    await prisma.modelPolicy.create({ data: { ownerType: 'org', ownerId: 'org', talking: SONNET, allowed: [SONNET, GPT] } })
    await orgKey('openrouter', 'org-openrouter')
    await storeKey('user', personId, 'mine', { provider: 'openai' })
    const result = await resolveConversationAccess(ref('PERSON'), null)
    expect(result.access).toEqual({
      provider: 'openrouter', model: 'openrouter/anthropic/claude-sonnet-5', apiKey: 'org-openrouter', owner: 'org', kind: 'API_KEY',
    })
    expect(result.notice).toBeUndefined()
  })

  it("talks on a bare Claude id where the policy names OpenCode's anthropic/ form", async () => {
    await prisma.modelPolicy.create({ data: { ownerType: 'user', ownerId: personId, talking: 'anthropic/claude-sonnet-5' } })
    await storeKey('user', personId, 'mine')
    expect((await resolveConversationAccess(ref('PERSON'), null)).access).toMatchObject({ provider: 'anthropic', model: SONNET })
  })

  it('in a personal project follows its person\'s own policy', async () => {
    const project = await createProject({ personalOwnerId: personId })
    await prisma.modelPolicy.create({ data: { ownerType: 'user', ownerId: personId, talking: GPT } })
    await storeKey('user', personId, 'mine', { provider: 'openai' })
    expect((await resolveConversationAccess(ref('PROJECT', { projectId: project.id }), null)).access?.model).toBe(GPT)
  })
})

describe('a talking model already fixed @SC-951', () => {
  const fixed = { model: SONNET, provider: 'anthropic' as const }

  it('is kept, on its provider only, whatever the policy now prefers', async () => {
    await prisma.modelPolicy.create({ data: { ownerType: 'user', ownerId: personId, talking: GPT } })
    await storeKey('user', personId, 'mine', { provider: 'openai' })
    await storeKey('user', personId, 'mine-anthropic')
    await expect(resolveConversationAccess(ref('PERSON'), fixed)).resolves.toEqual(paidBy('user', 'mine-anthropic'))
  })

  it('when its access is gone, says so and offers the next usable access', async () => {
    await prisma.modelPolicy.create({ data: { ownerType: 'user', ownerId: personId, talking: SONNET, allowed: [SONNET, GPT] } })
    await orgKey('openai', 'org-openai')
    const result = await resolveConversationAccess(ref('PERSON'), fixed)
    expect(result.access).toBeNull()
    expect(result.problem).toMatch(/^The Anthropic key this conversation talks on is no longer available\./)
    expect(result.offer).toEqual({ provider: 'openai', model: GPT, apiKey: 'org-openai', owner: 'org', kind: 'API_KEY' })
  })

  it('pays with the access recorded on the conversation while it is usable, not the first in the home\'s order', async () => {
    await storeKey('user', personId, 'mine')
    await orgKey('anthropic', 'org-key')
    await expect(resolveConversationAccess(ref('PERSON'), { ...fixed, owner: 'org' })).resolves.toEqual(paidBy('org', 'org-key'))
  })

  it('when the recorded key is gone, falls back in the home\'s order and says so once', async () => {
    await orgKey('anthropic', 'org-key')
    const result = await resolveConversationAccess(ref('PERSON'), { ...fixed, owner: 'user' })
    expect(result.access).toEqual({ provider: 'anthropic', model: SONNET, apiKey: 'org-key', owner: 'org', kind: 'API_KEY' })
    expect(result.notice).toBe(
      "Your own Anthropic key this conversation talked on is no longer available, so it now talks on the organisation's Anthropic key.",
    )
  })

  it('when nothing else is usable, offers nothing', async () => {
    const result = await resolveConversationAccess(ref('PERSON'), fixed)
    expect(result).toMatchObject({ access: null, offer: null })
  })
  it('when the provider refused its key, treats it as gone and offers the same model on the next key', async () => {
    await storeKey('user', personId, 'mine')
    await orgKey('anthropic', 'org-key')
    const result = await resolveConversationAccess(ref('PERSON'), fixed, { owner: 'user', provider: 'anthropic' })
    expect(result.access).toBeNull()
    expect(result.problem).toMatch(/^Anthropic refused your own Anthropic key this conversation talks on\./)
    expect(result.offer).toEqual({ provider: 'anthropic', model: SONNET, apiKey: 'org-key', owner: 'org', kind: 'API_KEY' })
  })

  it('never offers the refused key, falling to another model the policy allows', async () => {
    await prisma.modelPolicy.create({ data: { ownerType: 'user', ownerId: personId, talking: SONNET, allowed: [SONNET, GPT] } })
    await storeKey('user', personId, 'mine')
    await storeKey('user', personId, 'mine-openai', { provider: 'openai' })
    const result = await resolveConversationAccess(ref('PERSON'), fixed, { owner: 'user', provider: 'anthropic' })
    expect(result.offer).toEqual({ provider: 'openai', model: GPT, apiKey: 'mine-openai', owner: 'user', kind: 'API_KEY' })
  })
})
