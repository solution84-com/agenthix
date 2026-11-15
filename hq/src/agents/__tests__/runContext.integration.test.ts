/**
 * The context a run carries, built against the real database (spec §6, ADR-0058; models from one place, part 4): the
 * agent's settings as the run's boundary overrides them, the mounts of its own owner only, the site's risk rules, the
 * packages, the model the resolver gives the run with its provider (`modelAccess`), the org's web-search key for an
 * OpenCode turn, what the agent knows about the person who invoked a chat, and that person's timezone.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Agent } from '@prisma/client'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'
import { agentWithContent, orgModel, readyToDispatch } from './dispatchFixtures'
import { fakeVector } from '../../test/fakes/embedders'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../memory/embedding/embedders', () => import('../../test/fakes/embedders'))

import { buildContext } from '../runContext'
import { setProviderKey, WEB_SEARCH_PROVIDER, WEB_SEARCH_SERVICE } from '../../server/providerService'

let agent: Agent
let person: { id: string }
beforeEach(async () => {
  await readyToDispatch()
  agent = await agentWithContent({ name: 'Atlas', handle: `atlas-${Date.now().toString(36)}` })
  person = await createUser()
})

const own = () => ({ ownerType: 'user' as const, ownerId: person.id })
const userBoundary = () => ({ type: 'user' as const, id: person.id })

describe('what a run context carries', () => {
  it("the agent's settings, its own owner's mounts, the site's risk rules, the packages and its model's provider", async () => {
    await prisma.siteConfig.create({ data: { riskRules: [{ pattern: 'x' }] } })
    const { provider } = await orgModel('anthropic', 'sk-test-live')

    const context = await buildContext(agent, 'chat', own(), userBoundary())

    expect(context.mounts).toEqual({ ownerSlugs: { [person.id]: 'personal' } })
    expect(context).not.toHaveProperty('roster')
    expect(context.riskRules).toEqual([{ pattern: 'x' }])
    expect(context).not.toHaveProperty('credential')
    expect(context.modelAccess).toMatchObject({
      model: { providerId: provider.id, model: 'claude-sonnet-4-6' },
      provider: { kind: 'api_key', providerId: provider.id, vendor: 'anthropic', apiKey: 'sk-test-live' },
    })
    expect(context.packages.agent.key).toBe(agent.id)
    expect(context.agent).toEqual({
      id: agent.id, name: 'Atlas', handle: agent.handle, role: agent.role, runtime: 'claude-sdk', approval: 'deferred',
      defaultModel: 'claude-sonnet-4-6', allowedTools: null, allowedBashPatterns: null, isKernel: false,
    })
  })

  it('no risk rules when the site has none — null, not empty', async () => {
    expect((await buildContext(agent, 'task', own(), null)).riskRules).toBeNull()
  })

  it("mounts only the run's own project, by its slug, however many projects the agent is on", async () => {
    const projects = await Promise.all(['one', 'two', 'three'].map(slug => createProject({ name: slug, slug: `${slug}-${Date.now().toString(36)}` })))
    for (const p of projects) await prisma.projectAgent.create({ data: { projectId: p.id, agentId: agent.id } })

    const context = await buildContext(agent, 'chat', { ownerType: 'project', ownerId: projects[1].id }, null)

    expect(context.mounts).toEqual({ ownerSlugs: { [projects[1].id]: projects[1].slug } })
  })

  it('uses a slug the caller already resolved, verbatim', async () => {
    const context = await buildContext(agent, 'task', { ownerType: 'project', ownerId: 'proj-precomputed' }, null, undefined, 'already-resolved-slug')
    expect(context.mounts.ownerSlugs).toEqual({ 'proj-precomputed': 'already-resolved-slug' })
  })
})

describe("the run's model and provider (models from one place, part 4)", () => {
  it('says why there is none, and carries no reason when there is one', async () => {
    const none = await buildContext(agent, 'chat', own(), userBoundary())
    expect(none.modelAccess).toBeUndefined()
    expect(none.credentialProblem).toEqual(expect.any(String))

    await orgModel()
    expect('credentialProblem' in (await buildContext(agent, 'chat', own(), userBoundary()))).toBe(false)
  })

  it('follows the model and its provider, not the agent: a model via OpenRouter runs on OpenCode', async () => {
    const { provider, runtimeModel } = await orgModel('openrouter', 'sk-test-or')
    const context = await buildContext(agent, 'task', own(), userBoundary())
    expect(context.agent).toMatchObject({ runtime: 'opencode', defaultModel: runtimeModel })
    expect(context.modelAccess?.provider).toMatchObject({ providerId: provider.id, vendor: 'openrouter', apiKey: 'sk-test-or' })
  })
})

describe("the org's web-search key", () => {
  it('rides an OpenCode turn, following the model rather than the agent', async () => {
    await setProviderKey(WEB_SEARCH_SERVICE, WEB_SEARCH_PROVIDER, 'exa-key')
    await orgModel('openrouter')
    expect((await buildContext(agent, 'chat', own(), null)).webSearchKey).toBe('exa-key')
  })

  it("never rides a Claude turn, which searches on Anthropic's own service", async () => {
    await setProviderKey(WEB_SEARCH_SERVICE, WEB_SEARCH_PROVIDER, 'exa-key')
    expect('webSearchKey' in (await buildContext(agent, 'chat', own(), null))).toBe(false)
  })

  it('is absent, not empty, when the org has none', async () => {
    await orgModel('openrouter')
    expect('webSearchKey' in (await buildContext(agent, 'chat', own(), null))).toBe(false)
  })
})

describe("the person's timezone", () => {
  it('is carried for the person a chat or a task is on behalf of', async () => {
    await prisma.userSettings.create({ data: { userId: person.id, timezone: 'Australia/Sydney' } })
    expect((await buildContext(agent, 'chat', own(), null, { personUserId: person.id })).person).toEqual({ timezone: 'Australia/Sydney' })
    expect((await buildContext(agent, 'task', own(), null, { personUserId: person.id })).person).toEqual({ timezone: 'Australia/Sydney' })
  })

  it.each([null, 'Mars/Olympus'])('is absent when what the person set is %s', async (timezone) => {
    await prisma.userSettings.create({ data: { userId: person.id, timezone } })
    expect('person' in (await buildContext(agent, 'chat', own(), null, { personUserId: person.id }))).toBe(false)
  })

  it('is absent for a run with no person', async () => {
    expect('person' in (await buildContext(agent, 'chat', own(), null))).toBe(false)
  })
})

describe("a run's memory (ADR-0188) @SC-2106", () => {
  const rule = { title: 'Comparing hosting options', body: 'When comparing hosting options, lay them out in a table.', kind: 'RULE' as const }
  const save = (userId: string, over: Record<string, unknown> = {}) => prisma.memoryItem.create({
    data: {
      ...rule, key: 'hosting-table', userId, agentId: agent.id, placeType: 'user', placeId: userId,
      scopeKey: `person:${userId}/agent:${agent.id}/place:user:${userId}`,
      embedding: fakeVector(`${rule.title}\n${rule.body}`), embeddingModel: 'local', ...over,
    },
  })
  const task = (title: string) => ({
    taskId: 't1', taskKey: 'P-1', title, description: 'Compare the hosting options for the shop', projectId: 'p1',
    projectName: 'P', projectSlug: 'p', boardName: 'Task', columns: '',
  })

  it("is found with the task's title and description, under the run's person, agent and place", async () => {
    await save(person.id)
    const context = await buildContext(agent, 'task', own(), userBoundary(), { personUserId: person.id, startedBy: 'person', task: task('Comparing hosting options') })
    expect(context.memory?.items).toEqual([{ key: 'hosting-table', kind: 'rule', title: rule.title, body: rule.body }])
  })

  it('is found with the message that started a chat run', async () => {
    await save(person.id)
    const context = await buildContext(agent, 'chat', own(), userBoundary(), { personUserId: person.id, brief: 'Comparing hosting options, in a table please' })
    expect(context.memory?.items.map(i => i.key)).toEqual(['hosting-table'])
  })

  it.each(['pulse', 'schedule'] as const)("is absent for a %s's run, though its task has a person", async startedBy => {
    await save(person.id)
    const context = await buildContext(agent, 'task', own(), userBoundary(), { personUserId: person.id, startedBy, task: task('Comparing hosting options') })
    expect('memory' in context).toBe(false)
  })

  it('carries nothing of another person, and nothing when nothing was found', async () => {
    const other = await createUser()
    await save(other.id)
    expect('memory' in (await buildContext(agent, 'chat', own(), userBoundary(), { personUserId: person.id, brief: 'Comparing hosting options' }))).toBe(false)
    expect('pinnedMemory' in (await buildContext(agent, 'chat', own(), userBoundary(), { personUserId: person.id, brief: 'Comparing hosting options' }))).toBe(false)
  })
})
