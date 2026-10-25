/**
 * A conversation's places against the real test database (agent knowledge spec, part 4; adr-0152): its own place and
 * those its person added, listed for its header; only the person adds or removes one, only a place they can open; a
 * place they lose drops out at the next turn, and nothing reaches it; the lead's knowledge reach and its admission
 * of work follow the places.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createConversation, createProject, createTestTask, createUserWithRole, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { turnCapability } from '../../server/controlplane/__tests__/turnFixtures'
import { turnPlaces } from '../../server/controlplane/knowledgeReach'
import { admitToBoundary, notInConversation, personalBoundary } from '../work/boundaries'
import { dropLostPlaces } from '../places'
import { findOpenPlace } from '../placesSuggest'
import {
  NOT_THEIR_CONVERSATION, OWN_PLACE_STAYS, PLACE_UNREACHABLE, TASK_THREAD_PLACES, addConversationPlace, getConversationPlaces,
  removeConversationPlace,
} from '../placesOperations'

let person: { id: string }
let agent: { id: string }
let shop: { id: string; key: string; name: string; slug: string | null }
let conversation: { id: string }

const ctx = (user: { id: string }) => ({ user })
const project = (p: { id: string }) => ({ kind: 'project' as const, projectId: p.id })

beforeEach(async () => {
  person = await createUserWithRole('MEMBER')
  agent = await createAgent({ name: 'Kernel' })
  shop = await createProject({ name: 'Shop', slug: 'shop' })
  await joinProjectAs(shop.id, person.id, 'MEMBER')
  await prisma.projectAgent.create({ data: { projectId: shop.id, agentId: agent.id } })
  conversation = await createConversation({ openedById: person.id, agentId: agent.id })
})

describe("a conversation's places", () => {
  it('start with its own place, and list what the person can add: their projects, not one they are not in @SC-1435', async () => {
    await createProject({ name: 'Finance', slug: 'finance' })
    const places = await getConversationPlaces({ conversationId: conversation.id }, ctx(person))
    expect(places.own).toEqual({ kind: 'user', name: 'Your space', level: 'personal' })
    expect(places.added).toEqual([])
    expect(places.addable).toEqual([{ kind: 'project', projectId: shop.id, name: 'Shop', level: 'shop' }])
  })

  it('hold a place the person added, with who and when, and no longer offer it @SC-1435', async () => {
    await addConversationPlace({ conversationId: conversation.id, place: project(shop) }, ctx(person))
    const places = await getConversationPlaces({ conversationId: conversation.id }, ctx(person))
    expect(places.added).toEqual([expect.objectContaining({ kind: 'project', projectId: shop.id, name: 'Shop', addedBy: expect.objectContaining({ id: person.id }) })])
    expect(typeof places.added[0]!.addedAt).toBe('string')
    expect(places.addable).toEqual([])
  })

  it('add a place once, however often it is added @SC-1436', async () => {
    for (let i = 0; i < 2; i++) await addConversationPlace({ conversationId: conversation.id, place: project(shop) }, ctx(person))
    expect(await prisma.conversationPlace.count({ where: { conversationId: conversation.id } })).toBe(1)
  })

  it("in a project's conversation, offer the person's own space and let them add it @SC-1435", async () => {
    const inShop = await createConversation({ openedById: person.id, agentId: agent.id, home: 'PROJECT', projectId: shop.id })
    expect((await getConversationPlaces({ conversationId: inShop.id }, ctx(person))).addable[0]).toEqual({ kind: 'user', name: 'Your space', level: 'personal' })
    await addConversationPlace({ conversationId: inShop.id, place: { kind: 'user' } }, ctx(person))
    expect((await getConversationPlaces({ conversationId: inShop.id }, ctx(person))).added.map(a => a.kind)).toEqual(['user'])
  })
})

describe('only the person adds or removes, only a place they can open @SC-1436', () => {
  it('refuses a project the person is not in, and one that does not exist, in the same words', async () => {
    const finance = await createProject({ name: 'Finance' })
    await expect(addConversationPlace({ conversationId: conversation.id, place: project(finance) }, ctx(person))).rejects.toMatchObject({ statusCode: 403, message: PLACE_UNREACHABLE })
    await expect(addConversationPlace({ conversationId: conversation.id, place: { kind: 'project', projectId: 'no-such' } }, ctx(person))).rejects.toMatchObject({ statusCode: 403, message: PLACE_UNREACHABLE })
    expect(await prisma.conversationPlace.count()).toBe(0)
  })

  it("refuses someone else's personal project, and another person's conversation", async () => {
    const other = await createUserWithRole('MEMBER')
    const theirs = await createProject({ name: 'Theirs', personalOwnerId: other.id })
    await expect(addConversationPlace({ conversationId: conversation.id, place: project(theirs) }, ctx(person))).rejects.toMatchObject({ message: PLACE_UNREACHABLE })
    await joinProjectAs(shop.id, other.id, 'MEMBER')
    await expect(addConversationPlace({ conversationId: conversation.id, place: project(shop) }, ctx(other))).rejects.toBeTruthy()
    expect(await prisma.conversationPlace.count()).toBe(0)
  })

  it("refuses adding in a task's thread, and removing the conversation's own place", async () => {
    const task = await createTestTask({ data: { title: 'Release', number: 1, projectId: shop.id, onBehalfOfUserId: person.id, assignedAgentId: agent.id } })
    const thread = await createConversation({ openedById: person.id, agentId: agent.id, home: 'TASK', projectId: shop.id, taskId: task.id })
    await expect(addConversationPlace({ conversationId: thread.id, place: { kind: 'user' } }, ctx(person))).rejects.toMatchObject({ message: TASK_THREAD_PLACES })
    await expect(removeConversationPlace({ conversationId: conversation.id, place: { kind: 'user' } }, ctx(person))).rejects.toMatchObject({ message: OWN_PLACE_STAYS })
    expect(NOT_THEIR_CONVERSATION).toMatch(/Nothing was changed\.$/)
  })

  it('removes an added place', async () => {
    await addConversationPlace({ conversationId: conversation.id, place: project(shop) }, ctx(person))
    await removeConversationPlace({ conversationId: conversation.id, place: project(shop) }, ctx(person))
    expect((await getConversationPlaces({ conversationId: conversation.id }, ctx(person))).added).toEqual([])
  })
})

describe('a place the person loses drops out @SC-1437', () => {
  it('at the next turn, its row removed', async () => {
    await addConversationPlace({ conversationId: conversation.id, place: project(shop) }, ctx(person))
    await prisma.projectMember.deleteMany({ where: { projectId: shop.id, userId: person.id } })
    await dropLostPlaces(conversation.id)
    expect(await prisma.conversationPlace.count({ where: { conversationId: conversation.id } })).toBe(0)
  })

  it('and nothing reaches it meanwhile: not the knowledge reach', async () => {
    await addConversationPlace({ conversationId: conversation.id, place: project(shop) }, ctx(person))
    await prisma.projectMember.deleteMany({ where: { projectId: shop.id, userId: person.id } })
    const turn = turnCapability({ conversationId: conversation.id, agentId: agent.id, actingUserId: person.id })
    expect((await turnPlaces(turn)).map(p => p.level)).toEqual(['personal'])
  })
})

describe("the lead's reach follows the places", () => {
  const turn = () => turnCapability({ conversationId: conversation.id, agentId: agent.id, actingUserId: person.id })

  it('is the own place alone until the person adds one, then the own place first @SC-1410 @SC-1435', async () => {
    expect((await turnPlaces(turn())).map(p => p.level)).toEqual(['personal'])
    await addConversationPlace({ conversationId: conversation.id, place: project(shop) }, ctx(person))
    expect(await turnPlaces(turn())).toEqual([
      { level: 'personal', owner: { ownerType: 'user', ownerId: person.id } },
      { level: 'shop', owner: { ownerType: 'project', ownerId: shop.id } },
    ])
    await removeConversationPlace({ conversationId: conversation.id, place: project(shop) }, ctx(person))
    expect((await turnPlaces(turn())).map(p => p.level)).toEqual(['personal'])
  })

  it('admits work only in a place the conversation holds @SC-1442', async () => {
    const asBoundary = { key: shop.key, type: 'project' as const, id: shop.id, name: shop.name }
    const admit = () => admitToBoundary({ personId: person.id, agentId: agent.id, boundary: asBoundary, tool: 'start_work', conversationId: conversation.id })
    expect(await admit()).toEqual({ ok: false, reason: notInConversation('Shop') })
    await addConversationPlace({ conversationId: conversation.id, place: project(shop) }, ctx(person))
    expect(await admit()).toEqual({ ok: true })
    expect(await admitToBoundary({ personId: person.id, agentId: agent.id, boundary: personalBoundary(person.id), tool: 'start_work', conversationId: conversation.id })).toEqual({ ok: true })
  })
})

describe('suggest_place finds only a place the person can open @SC-1439', () => {
  it('by slug, key or name; never a project they are not in', async () => {
    for (const words of ['shop', 'shop:', shop.key, 'Shop']) expect(await findOpenPlace(person.id, words)).toEqual({ type: 'project', id: shop.id })
    expect(await findOpenPlace(person.id, 'personal')).toEqual({ type: 'user', id: person.id })
    await createProject({ name: 'Finance', slug: 'finance' })
    expect(await findOpenPlace(person.id, 'finance')).toBeNull()
  })
})
