/**
 * A save that meets a near-duplicate the person promoted (spec, Saving; decision 6: only the person widens a memory),
 * against the real test database with the deterministic fake embedder: the wider memory is never written into; only
 * a Rule the person asked for replaces it where it holds; anything else is saved in the agent's own scope, the wider
 * one left live; the scope's cap holds on every way in. Also the conversation a memory was saved in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createConversation, createProject, createUser } from '../../test/factories'
import { createFakeEmbedder } from '../../test/fakes/embedders'
import { MEMORY_SCOPE_MAX_ITEMS } from '../../shared/memory/protocol'
import type { MemoryPrincipal, RememberInput } from '../contract'
import { scopeColumns } from '../scopes'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { createMemoryService } from '../memoryService'

const embedder = createFakeEmbedder()
const service = createMemoryService({ embedderFor: () => embedder })

let alice: string
let kernel: string
let scout: string
let shop: string
let inShop: MemoryPrincipal

const release = { title: 'Release day', body: 'The team ships the weekly release on Thursday afternoons after the review meeting.' }
const tables = { title: 'Comparing options', body: 'When comparing options for the person, always lay them out in a table.' }
/** Near enough to `tables` to be its near-duplicate, under another key. */
const tablesAgain = { title: 'Comparing the options', body: `${tables.body.slice(0, -1)}, every time.` }

/** Saved by Scout in Your space, then promoted by the person to every agent, everywhere. */
async function promoted(item: Omit<RememberInput, 'kind'>, kind: 'FACT' | 'RULE'): Promise<string> {
  const outcome = await service.remember({ personId: alice, agentId: scout, place: { type: 'user', id: alice } }, { ...item, kind })
  if (outcome.status === 'refused') throw new Error(outcome.reason)
  expect(await service.setScope(alice, outcome.itemId, { agent: 'every', place: 'everywhere' })).toMatchObject({ status: 'changed' })
  return outcome.itemId
}

const kernelInShop = () => scopeColumns({ person: alice, agent: kernel, place: { type: 'project', id: shop } })
const everywhere = () => scopeColumns({ person: alice, agent: null, place: null })

beforeEach(async () => {
  alice = (await createUser()).id
  kernel = (await createAgent()).id
  scout = (await createAgent()).id
  shop = (await createProject({ name: 'Shop' })).id
  inShop = { personId: alice, agentId: kernel, place: { type: 'project', id: shop } }
})

describe('a near-duplicate the person promoted @SC-2104', () => {
  it('is never joined onto: a Fact that adds to it is saved on its own where the agent works', async () => {
    const wide = await promoted(release, 'FACT')
    const added = 'The team ships the weekly release on Thursday afternoons after the client review meeting.'
    const outcome = await service.remember(inShop, { title: 'Weekly release', body: added, kind: 'FACT' })
    expect(outcome).toMatchObject({ status: 'added', key: 'weekly-release' })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: wide } })).toMatchObject({ body: release.body, archived: false })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: (outcome as { itemId: string }).itemId } }))
      .toMatchObject({ ...kernelInShop(), body: added, supersedesId: null })
  })

  it('is replaced where it holds by a Rule the person asked for, the old one archived', async () => {
    const wide = await promoted(tables, 'RULE')
    const body = tablesAgain.body
    const outcome = await service.remember(inShop, { ...tablesAgain, kind: 'RULE', requested: true })
    expect(outcome).toMatchObject({ status: 'superseded', key: 'comparing-the-options' })
    const next = await prisma.memoryItem.findUniqueOrThrow({ where: { id: (outcome as { itemId: string }).itemId } })
    expect(next).toMatchObject({ ...everywhere(), body, supersedesId: wide, writtenByAgentId: kernel, savedInPlaceType: 'project', savedInPlaceId: shop })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: wide } })).toMatchObject({ archived: true })
    // Scout, elsewhere, follows the corrected rule.
    expect((await service.recallByKey({ personId: alice, agentId: scout, place: null }, ['comparing-the-options'])).map(i => i.body)).toEqual([body])
  })

  it('takes a numbered key when the replacing Rule would reuse the old one\'s key there', async () => {
    const wide = await promoted(tables, 'RULE')
    const outcome = await service.remember(inShop, { ...tables, body: `${tables.body.slice(0, -1)}, always.`, kind: 'RULE', requested: true })
    expect(outcome).toMatchObject({ status: 'superseded', key: 'comparing-options-2' })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: wide } })).toMatchObject({ key: 'comparing-options', archived: true })
  })

  it('stays live when a Rule nobody asked for comes near it: the new one is saved where the agent works', async () => {
    const wide = await promoted(tables, 'RULE')
    const outcome = await service.remember(inShop, { ...tablesAgain, kind: 'RULE' })
    expect(outcome).toMatchObject({ status: 'added' })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: (outcome as { itemId: string }).itemId } })).toMatchObject({ ...kernelInShop(), supersedesId: null })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: wide } })).toMatchObject({ ...everywhere(), archived: false })
  })

  it('stays live when a Fact the person asked for says everything it did and more', async () => {
    const wide = await promoted(release, 'FACT')
    const outcome = await service.remember(inShop, { title: 'Release day here', body: `${release.body} From main.`, kind: 'FACT', requested: true })
    expect(outcome).toMatchObject({ status: 'added' })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: wide } })).toMatchObject({ archived: false })
  })

  it('is refused past the cap of the scope the new memory would go into', async () => {
    await promoted(tables, 'RULE')
    await prisma.memoryItem.createMany({
      data: Array.from({ length: MEMORY_SCOPE_MAX_ITEMS }, (_, i) => ({ ...kernelInShop(), key: `k${i}`, title: `t${i}`, body: 'b', kind: 'FACT' as const })),
    })
    const outcome = await service.remember(inShop, { ...tablesAgain, kind: 'RULE' })
    expect(outcome).toMatchObject({ status: 'refused', reason: expect.stringMatching(/Forget something/) })
  })
})

describe('the conversation a memory was saved in @SC-2109', () => {
  it('is kept with the memory, none for a run, and emptied when the conversation is deleted', async () => {
    const conversation = await createConversation({ openedById: alice, agentId: kernel })
    const saved = await service.remember(inShop, { ...release, kind: 'FACT', conversationId: conversation.id })
    const byRun = await service.remember(inShop, { ...tables, kind: 'RULE' })
    const id = (saved as { itemId: string }).itemId
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ savedInConversationId: conversation.id })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: (byRun as { itemId: string }).itemId } })).toMatchObject({ savedInConversationId: null })
    await prisma.conversation.delete({ where: { id: conversation.id } })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id } })).toMatchObject({ savedInConversationId: null })
  })
})
