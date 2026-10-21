/**
 * The context a run carries, built against the real database (spec §6, §6.3, ADR-0058, ADR-0060): the agent's
 * settings as the run's boundary overrides them, the mounts of its own owner only, the site's risk rules, the
 * packages, the credential its boundary owns for the runtime and model the site will run, other providers'
 * credentials for fallback models, the org's web-search key for an OpenCode turn, what the agent knows about the
 * person who invoked a chat, and that person's timezone.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Agent } from '@prisma/client'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'
import { agentWithContent, apiKeyFor, readyToDispatch } from './dispatchFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

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
const opencode = (model = 'openrouter/qwen/qwen3.8-27b:free') =>
  agentWithContent({ runtime: 'opencode', defaultModel: model })

describe('what a run context carries', () => {
  it("the agent's settings, its own owner's mounts, the site's risk rules, the packages and its boundary's key", async () => {
    await prisma.siteConfig.create({ data: { riskRules: [{ pattern: 'x' }] } })
    await apiKeyFor('user', person.id, 'sk-live')

    const context = await buildContext(agent, 'chat', own(), userBoundary())

    expect(context.mounts).toEqual({ ownerSlugs: { [person.id]: 'personal' } })
    expect(context).not.toHaveProperty('roster')
    expect(context.riskRules).toEqual([{ pattern: 'x' }])
    expect(context.credential).toEqual({ kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-live' })
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

describe('memory is recalled, never carried whole (memory and knowledge spec) @SC-986', () => {
  it('no run carries memory in its context, whatever is held about its person', async () => {
    await prisma.memoryItem.create({
      data: { scope: 'PERSON', scopeKey: `person:${person.id}`, key: 'tea', userId: person.id, title: 'Tea', body: 'Prefers tea to coffee in the morning.', kind: 'PREFERENCE' },
    })
    expect('memory' in (await buildContext(agent, 'chat', own(), null, { personUserId: person.id }))).toBe(false)
    expect('memory' in (await buildContext(agent, 'task', own(), null, { personUserId: person.id }))).toBe(false)
  })
})

describe('the credential (spec §6.3, ADR-0060)', () => {
  it("is the one the run's boundary owns, not one chosen by anything about the agent", async () => {
    const project = await createProject({ name: 'P9' })
    await apiKeyFor('project', project.id, 'sk-project')
    await apiKeyFor('user', person.id, 'sk-person')
    const context = await buildContext(agent, 'chat', { ownerType: 'project', ownerId: project.id }, { type: 'project', id: project.id })
    expect(context.credential).toMatchObject({ apiKey: 'sk-project' })
  })

  it('says why there is none, and carries no reason when there is one', async () => {
    const none = await buildContext(agent, 'chat', own(), userBoundary())
    expect(none.credential).toBeNull()
    expect(none.credentialProblem).toEqual(expect.any(String))

    await apiKeyFor('user', person.id, 'sk-live')
    expect('credentialProblem' in (await buildContext(agent, 'chat', own(), userBoundary()))).toBe(false)
  })

  it("is for the agent's own runtime: a model OpenCode cannot place has no credential, and says so", async () => {
    await apiKeyFor('user', person.id, 'sk-live')
    const context = await buildContext(await opencode('claude-sonnet-4-6'), 'chat', own(), userBoundary())
    expect(context.credential).toBeNull()
    expect(context.credentialProblem).toMatch(/does not name a provider/)
  })

  it("is for the conversation's own runtime and model, not the agent's current ones", async () => {
    await apiKeyFor('user', person.id, 'sk-openai', 'openai')
    const context = await buildContext(agent, 'chat', own(), userBoundary(), { session: { runtime: 'opencode', model: 'openai/gpt-5' } })
    expect(context.credential).toMatchObject({ provider: 'openai', apiKey: 'sk-openai' })
  })

  it("falls back to the agent's runtime and model when the session records neither", async () => {
    await apiKeyFor('user', person.id, 'sk-or', 'openrouter')
    const context = await buildContext(await opencode(), 'task', own(), userBoundary(), { session: { runtime: null, model: null } })
    expect(context.credential).toMatchObject({ provider: 'openrouter', apiKey: 'sk-or' })
  })

  it("carries other providers' credentials for the fallback models, and none when there are none", async () => {
    await apiKeyFor('user', person.id, 'sk-or', 'openrouter')
    await apiKeyFor('user', person.id, 'sk-oai', 'openai')
    const withFallback = await buildContext(await opencode(), 'chat', own(), userBoundary(), { fallbackModels: ['openai/gpt-5'] })
    expect(withFallback.credential).toMatchObject({ provider: 'openrouter' })
    expect(withFallback.fallbackCredentials).toEqual([expect.objectContaining({ provider: 'openai', apiKey: 'sk-oai' })])
    expect('fallbackCredentials' in (await buildContext(await opencode(), 'task', own(), userBoundary()))).toBe(false)
  })
})

describe("the org's web-search key", () => {
  it('rides an OpenCode turn, following the conversation rather than the agent', async () => {
    await setProviderKey(WEB_SEARCH_SERVICE, WEB_SEARCH_PROVIDER, 'exa-key')
    expect((await buildContext(await opencode(), 'chat', own(), null)).webSearchKey).toBe('exa-key')
    expect((await buildContext(agent, 'chat', own(), null, { session: { runtime: 'opencode', model: 'openrouter/x' } })).webSearchKey).toBe('exa-key')
  })

  it("never rides a Claude turn, which searches on Anthropic's own service", async () => {
    await setProviderKey(WEB_SEARCH_SERVICE, WEB_SEARCH_PROVIDER, 'exa-key')
    expect('webSearchKey' in (await buildContext(agent, 'chat', own(), null))).toBe(false)
  })

  it('is absent, not empty, when the org has none', async () => {
    expect('webSearchKey' in (await buildContext(await opencode(), 'chat', own(), null))).toBe(false)
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

describe('the pinned memory a run starts with @SC-992', () => {
  const pin = (data: Record<string, unknown>) =>
    prisma.memoryItem.create({ data: { title: 'A fact', body: 'Something worth knowing.', kind: 'FACT', pinned: true, ...data } as never })
  const personItem = (key: string, pinned = true) => pin({
    key, pinned, scope: 'AGENT_PERSON', scopeKey: `agent-person:${agent.id}:${person.id}`, userId: person.id, agentId: agent.id,
  })
  const placeItem = (key: string) => pin({
    key, scope: 'AGENT_PLACE', scopeKey: `agent-place:${agent.id}:user:${person.id}`, agentId: agent.id, placeType: 'user', placeId: person.id,
  })

  it("carries the person's pinned items and the place's, and leaves what is not pinned out", async () => {
    await personItem('tea'); await personItem('unpinned', false); await placeItem('region')

    const context = await buildContext(agent, 'chat', own(), userBoundary(), { personUserId: person.id, startedBy: 'person' })

    expect(context.pinnedMemory?.map(i => `${i.scope}:${i.key}`).sort()).toEqual(['agent_person:tea', 'agent_place:region'])
  })

  it("carries the place's alone for a pulse's or a schedule's run, though its task has a person", async () => {
    await personItem('tea'); await placeItem('region')

    for (const startedBy of ['pulse', 'schedule'] as const) {
      const context = await buildContext(agent, 'task', own(), userBoundary(), { personUserId: person.id, startedBy })
      expect(context.pinnedMemory?.map(i => i.key)).toEqual(['region'])
    }
  })

  it('is absent, not empty, when nothing is pinned', async () => {
    expect('pinnedMemory' in (await buildContext(agent, 'chat', own(), userBoundary(), { personUserId: person.id }))).toBe(false)
  })

  it('carries nothing of another person: a run for someone else sees none of this person\'s', async () => {
    await personItem('tea')
    const other = await createUser()
    const context = await buildContext(agent, 'chat', own(), userBoundary(), { personUserId: other.id })
    expect('pinnedMemory' in context).toBe(false)
  })
})
