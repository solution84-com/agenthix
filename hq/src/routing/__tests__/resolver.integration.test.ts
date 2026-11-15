/**
 * The resolver against the real test database (models from one place, part 4): what it reads — providers and their
 * state, the organisation's and the agent's choices, the lists that apply, a person's own subscription in their own
 * place, the billing profile of the place — and what a run is given to reach the result.
 */
import { describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUserWithRole } from '../../test/factories'
import { createProvider, createSubscription, setAgentChoices, setList, setOrgDefaults } from './routingFixtures'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { conversationOffer, resolve } from '../resolver'
import { runModelAccess } from '../reaching'
import { placeOfProject } from '../place'

const SONNET = 'claude-sonnet-4-5'

async function twoProviders() {
  const anthropic = await createProvider({ vendor: 'anthropic', name: 'Anthropic' })
  const openrouter = await createProvider({ vendor: 'openrouter', name: 'OpenRouter' })
  await setOrgDefaults({ conversation: { providerId: anthropic.id, model: SONNET } })
  return { anthropic, openrouter }
}

describe('the resolver, reading what is stored', () => {
  it("answers the organisation's default, and the agent's own over it @SC-1192", async () => {
    const { anthropic, openrouter } = await twoProviders()
    const agent = await createAgent()
    const place = { kind: 'organisation' as const }
    expect(await resolve({ purpose: 'conversation', place, agentId: agent.id })).toMatchObject({ ok: true, resolution: { model: { providerId: anthropic.id, model: SONNET }, from: 'organisation' } })
    await setAgentChoices(agent.id, { conversation: { providerId: openrouter.id, model: 'openai/gpt-5' } })
    expect(await resolve({ purpose: 'conversation', place, agentId: agent.id })).toMatchObject({ ok: true, resolution: { from: 'agent', providerName: 'OpenRouter' } })
  })

  it("applies a shared project's list, and costs to the project's billing profile @SC-1194", async () => {
    const { anthropic } = await twoProviders()
    const profile = await prisma.billingProfile.create({ data: { name: 'Client X' } })
    const project = await createProject({ billingProfileId: profile.id })
    await setList('project', project.id, 'every', [{ effect: 'never', pattern: 'anthropic/claude-sonnet-*' }])
    const answer = await resolve({ purpose: 'worker', place: await placeOfProject(project.id) })
    if (!answer.ok) throw new Error(answer.problem.message)
    expect(answer.resolution.model.model).not.toMatch(/sonnet/)
    expect(answer.resolution.fellBack).toEqual({ from: { providerId: anthropic.id, model: SONNET }, reason: 'model_not_allowed' })
    expect(answer.resolution.billingProfileId).toBe(profile.id)
  })

  it('goes around a provider that is not working, and offers a conversation fixed to it the same model elsewhere @SC-1196', async () => {
    const { anthropic, openrouter } = await twoProviders()
    await prisma.aiProvider.update({ where: { id: anthropic.id }, data: { state: 'key_refused' } })
    const person = await createUserWithRole('MEMBER')
    const r = await resolve({ purpose: 'conversation', place: { kind: 'own', userId: person.id } })
    expect(r).toMatchObject({ ok: true, resolution: { model: { providerId: openrouter.id, model: 'anthropic/claude-sonnet-4.5' } } })

    const conversation = await prisma.conversation.create({
      data: { home: 'PERSON', openedById: person.id, talkingModel: SONNET, talkingProviderId: anthropic.id },
    })
    const req = { purpose: 'conversation' as const, place: { kind: 'own' as const, userId: person.id }, conversationId: conversation.id }
    expect(await resolve(req)).toMatchObject({ ok: false, problem: { code: 'provider_not_working', providerId: anthropic.id } })
    expect(await conversationOffer(req)).toEqual({ providerId: openrouter.id, model: 'anthropic/claude-sonnet-4.5' })
  })

  it("serves a person's own subscription in their personal project, and hands it only to a run that runs as them @SC-1197", async () => {
    await twoProviders()
    const person = await createUserWithRole('MEMBER')
    const sub = await createSubscription(person.id)
    const project = await createProject({ personalOwnerId: person.id })
    const place = await placeOfProject(project.id)
    expect(place).toEqual({ kind: 'own', userId: person.id, projectId: project.id })
    const answer = await resolve({ purpose: 'worker', place, pick: { providerId: sub.id, model: SONNET } })
    if (!answer.ok) throw new Error(answer.problem.message)
    expect(answer.resolution).toMatchObject({ runtime: 'claude-sdk', basis: 'INCLUDED' })

    const asThem = { siteId: 's1', runner: { kind: 'person' as const, userId: person.id } }
    const given = await runModelAccess(answer.resolution, [], asThem)
    expect(given?.provider).toMatchObject({ kind: 'subscription', providerId: sub.id })
    expect(await prisma.subscriptionGrant.count({ where: { providerId: sub.id } })).toBe(1)
    const asProject = { ...asThem, runner: { kind: 'project' as const, projectId: project.id } }
    expect(await runModelAccess(answer.resolution, [], asProject)).toBeNull()

    const shared = await createProject()
    expect(await resolve({ purpose: 'worker', place: await placeOfProject(shared.id), pick: { providerId: sub.id, model: SONNET } }))
      .toMatchObject({ ok: false, problem: { code: 'subscription_outside_own_place' } })
  })

  it("gives a run the organisation's key for its provider, never in a log @SC-1192", async () => {
    const { anthropic } = await twoProviders()
    const answer = await resolve({ purpose: 'worker', place: { kind: 'organisation' } })
    if (!answer.ok) throw new Error(answer.problem.message)
    const given = await runModelAccess(answer.resolution, [])
    expect(given).toMatchObject({ model: { providerId: anthropic.id, model: SONNET }, provider: { kind: 'api_key', vendor: 'anthropic', apiKey: 'sk-test-fake' } })
  })
})
