/**
 * The person promotes their memory or flips it back, and forgets it (ADR-0188; spec, The memory record), against
 * the real test database: only their own; a switch flips back to the agent and place it was saved by and in; a key
 * already held in the new scope is the near-duplicate rule when the two are alike, and a numbered key otherwise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'
import { createFakeEmbedder } from '../../test/fakes/embedders'
import { MEMORY_SCOPE_MAX_ITEMS } from '../../shared/memory/protocol'
import type { MemoryPrincipal } from '../contract'
import { scopeColumns } from '../scopes'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { createMemoryService } from '../memoryService'
import { SAVING_AGENT_GONE } from '../scopeChange'

const embedder = createFakeEmbedder()
const service = createMemoryService({ embedderFor: () => embedder })

let alice: string
let bob: string
let kernel: string
let scout: string
let shop: string
let inShop: MemoryPrincipal

const tables = { title: 'Comparing options', body: 'When comparing options for the person, always lay them out in a table.', kind: 'RULE' as const }

async function saved(principal: MemoryPrincipal = inShop, item = tables): Promise<string> {
  const outcome = await service.remember(principal, item)
  if (outcome.status === 'refused') throw new Error(outcome.reason)
  return outcome.itemId
}

beforeEach(async () => {
  alice = (await createUser()).id
  bob = (await createUser()).id
  kernel = (await createAgent()).id
  scout = (await createAgent()).id
  shop = (await createProject({ name: 'Shop' })).id
  inShop = { personId: alice, agentId: kernel, place: { type: 'project', id: shop } }
})

describe('promoting and flipping back @SC-2107', () => {
  it('widens a memory to every agent, everywhere, and back to the agent and place that saved it', async () => {
    const id = await saved()
    expect(await service.setScope(alice, id, { agent: 'every', place: 'everywhere' })).toEqual({ status: 'changed', itemId: id })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id } })).toMatchObject({
      agentId: null, placeType: null, placeId: null, scopeKey: `person:${alice}/agent:*/place:*`,
      writtenByAgentId: kernel, savedInPlaceType: 'project', savedInPlaceId: shop,
    })
    expect(await service.recallByKey({ personId: alice, agentId: scout, place: null }, ['comparing-options'])).toHaveLength(1)

    expect(await service.setScope(alice, id, { agent: 'saved', place: 'saved' })).toEqual({ status: 'changed', itemId: id })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ agentId: kernel, placeType: 'project', placeId: shop })
    expect(await service.recallByKey({ personId: alice, agentId: scout, place: null }, ['comparing-options'])).toEqual([])
  })

  it('changes nothing when the switches already say so', async () => {
    const id = await saved()
    expect(await service.setScope(alice, id, { agent: 'saved', place: 'saved' })).toEqual({ status: 'unchanged', itemId: id })
  })

  it("refuses another person's memory, as if it were gone", async () => {
    const id = await saved()
    expect(await service.setScope(bob, id, { agent: 'every', place: 'everywhere' })).toMatchObject({ status: 'refused' })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ agentId: kernel })
  })

  it('keeps a promoted memory whose saving agent is deleted, and cannot flip it back to that agent', async () => {
    const id = await saved()
    await service.setScope(alice, id, { agent: 'every', place: 'saved' })
    await prisma.agent.delete({ where: { id: kernel } })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ writtenByAgentId: null })
    expect(await service.setScope(alice, id, { agent: 'saved', place: 'saved' })).toEqual({ status: 'refused', reason: SAVING_AGENT_GONE })
  })

  it('removes a memory scoped to an agent when that agent is deleted @SC-2101', async () => {
    await saved()
    await prisma.agent.delete({ where: { id: kernel } })
    expect(await prisma.memoryItem.count()).toBe(0)
  })

  it('keeps a memory with no saved place everywhere when its own place is asked for', async () => {
    const id = await saved({ personId: alice, agentId: kernel, place: null })
    expect(await service.setScope(alice, id, { agent: 'saved', place: 'saved' })).toEqual({ status: 'unchanged', itemId: id })
    await prisma.memoryItem.update({ where: { id }, data: { savedInPlaceType: null, savedInPlaceId: null } })
    expect(await service.setScope(alice, id, { agent: 'every', place: 'saved' })).toEqual({ status: 'changed', itemId: id })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ agentId: null, placeId: null })
  })
})

describe('a key already held in the new scope @SC-2107', () => {
  it('takes the key with a number added when the two are not alike', async () => {
    await prisma.memoryItem.create({
      data: { ...scopeColumns({ person: alice, agent: null, place: null }), key: 'comparing-options', title: 'Comparing options', body: 'Something else entirely about the person.', kind: 'FACT' },
    })
    const id = await saved()
    expect(await service.setScope(alice, id, { agent: 'every', place: 'everywhere' })).toEqual({ status: 'changed', itemId: id })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ key: 'comparing-options-2', agentId: null })
  })

  it('is the near-duplicate rule when the two are alike: the newer Rule replaces the one held', async () => {
    const promoted = await saved({ personId: alice, agentId: scout, place: null })
    await service.setScope(alice, promoted, { agent: 'every', place: 'everywhere' })
    const id = await saved(inShop, { ...tables, body: `${tables.body} Columns are the options.` })
    // The second save met the promoted one, which nobody asked to replace: it was saved in Kernel's own scope beside it.
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: promoted } })).toMatchObject({ archived: false })
    const outcome = await service.setScope(alice, id, { agent: 'every', place: 'everywhere' })
    expect(outcome).toEqual({ status: 'changed', itemId: id })
    expect(await prisma.memoryItem.findUnique({ where: { id: promoted } })).toBeNull()
  })
})

describe('an archived memory holding the key in the new scope @SC-2107', () => {
  it('is treated as absent: the promoted memory takes the key, the archived one keeps a numbered key', async () => {
    const archived = await prisma.memoryItem.create({
      data: { ...scopeColumns({ person: alice, agent: null, place: null }), key: 'comparing-options', title: 'Comparing options', body: tables.body, kind: 'RULE', archived: true },
    })
    const id = await saved()
    expect(await service.setScope(alice, id, { agent: 'every', place: 'everywhere' })).toEqual({ status: 'changed', itemId: id })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ key: 'comparing-options', agentId: null, placeId: null, archived: false })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: archived.id } })).toMatchObject({ key: 'comparing-options-2', archived: true })
    expect((await service.recallByKey({ personId: alice, agentId: scout, place: null }, ['comparing-options'])).map(i => i.itemId)).toEqual([id])
  })
})

describe('the cap of the scope a memory is promoted into @SC-2107', () => {
  it('refuses a promotion into a full scope, and leaves the memory where it was', async () => {
    const id = await saved()
    await prisma.memoryItem.createMany({
      data: Array.from({ length: MEMORY_SCOPE_MAX_ITEMS }, (_, i) => ({ ...scopeColumns({ person: alice, agent: null, place: null }), key: `k${i}`, title: `t${i}`, body: 'b', kind: 'FACT' as const })),
    })
    expect(await service.setScope(alice, id, { agent: 'every', place: 'everywhere' })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/Forget something/) })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ agentId: kernel, placeId: shop })
  })
})

describe('forgetting on the screen @SC-2107', () => {
  it("forgets the person's own memory, and never another's", async () => {
    const id = await saved()
    expect(await service.forgetOwn(bob, id)).toBe(false)
    expect(await service.forgetOwn(alice, id)).toBe(true)
    expect(await service.forgetOwn(alice, id)).toBe(false)
  })
})
