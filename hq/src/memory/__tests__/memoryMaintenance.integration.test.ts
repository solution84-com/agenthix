/**
 * Memory's background work against the real test database, with the fake embedder: switching the organisation's
 * embedding model and the re-embed that finishes it, and the tidy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'
import { createFakeEmbedder, fakeVector } from '../../test/fakes/embedders'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../embedding/embedders', () => import('../../test/fakes/embedders'))

import { REEMBED_BATCH, reembedBatch } from '../reembed'
import { applyChange, tidyMemory } from '../tidy'

const PROVIDER = 'openai/text-embedding-3-small'
const DAY = 86_400_000
const now = new Date('2026-10-16T12:00:00Z')

let alice: string
let scout: string

function row(key: string, over: Record<string, unknown> = {}) {
  const title = (over.title as string) ?? key
  const body = (over.body as string) ?? `${key} is something the agent learned while working.`
  return {
    scope: 'PERSON' as const, scopeKey: `person:${alice}`, userId: alice, key, title, body, kind: 'FACT' as const,
    embedding: fakeVector(`${title}\n${body}`), embeddingModel: 'local', updatedAt: now, ...over,
  }
}

beforeEach(async () => {
  alice = (await createUser()).id
  scout = (await createAgent()).id
  await prisma.org.create({ data: { name: 'Org' } })
})

describe('the background embed @SC-988', () => {
  it('moves items embedded in another model, in batches, into the built-in one', async () => {
    await prisma.memoryItem.createMany({ data: Array.from({ length: REEMBED_BATCH + 5 }, (_, i) => row(`k${i}`, { embeddingModel: PROVIDER })) })
    const embedFor = () => createFakeEmbedder('local')
    expect(await reembedBatch(embedFor)).toEqual({ embedded: REEMBED_BATCH })
    expect(await reembedBatch(embedFor)).toEqual({ embedded: 5 })
    expect(await reembedBatch(embedFor)).toEqual({ embedded: 0 })
    expect(await prisma.memoryItem.count({ where: { embeddingModel: 'local' } })).toBe(REEMBED_BATCH + 5)
  })

  it('gives a vector to an item written while its model could not embed', async () => {
    await prisma.memoryItem.create({ data: row('waiting', { embedding: [], embeddingModel: null }) })
    expect(await reembedBatch(() => createFakeEmbedder('local'))).toEqual({ embedded: 1 })
    expect((await prisma.memoryItem.findFirstOrThrow()).embedding).toHaveLength(384)
  })

  it('makes no change when the model fails, and tries again on the next pass', async () => {
    await prisma.memoryItem.create({ data: row('waiting', { embedding: [], embeddingModel: null }) })
    const failing = () => ({ model: 'local', dimensions: 384, embed: async () => { throw new Error('offline') } })
    expect(await reembedBatch(failing)).toEqual({ embedded: 0 })
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({ embeddingModel: null })
  })
})

describe('the tidy @SC-990', () => {
  it('archives items nobody recalled for months, and never a pinned one', async () => {
    const cold = new Date(now.getTime() - 200 * DAY)
    await prisma.memoryItem.createMany({
      data: [
        row('never-recalled', { updatedAt: cold }),
        row('recalled-long-ago', { lastRecalledAt: cold, title: 'Build tool', body: 'The project builds with Vite and checks types with tsc.' }),
        row('pinned-and-cold', { updatedAt: cold, pinned: true, title: 'Name', body: 'The person likes to be called Sam at work.' }),
        row('recalled-lately', { updatedAt: cold, lastRecalledAt: new Date(now.getTime() - 5 * DAY), title: 'Editor', body: 'The person writes code in Neovim with a dark theme.' }),
      ],
    })
    expect(await tidyMemory(now)).toMatchObject({ archived: 2 })
    const archived = await prisma.memoryItem.findMany({ where: { archived: true }, select: { key: true }, orderBy: { key: 'asc' } })
    expect(archived.map(r => r.key)).toEqual(['never-recalled', 'recalled-long-ago'])
  })

  it('merges items in one scope that say the same thing, and leaves another scope\'s alone', async () => {
    const release = { title: 'Release day', body: 'The team ships the weekly release on Thursday afternoons after the review meeting.' }
    const weekly = { title: 'Weekly release', body: 'The team ships the weekly release on Thursday afternoons after the client review meeting.' }
    await prisma.memoryItem.createMany({
      data: [
        row('release-day', { ...release, embedding: fakeVector(`${release.title}\n${release.body}`), updatedAt: new Date(now.getTime() - DAY) }),
        row('weekly-release', { ...weekly, embedding: fakeVector(`${weekly.title}\n${weekly.body}`) }),
        row('weekly-release', { ...weekly, scope: 'AGENT_PERSON', scopeKey: `agent-person:${scout}:${alice}`, agentId: scout, embedding: fakeVector(`${weekly.title}\n${weekly.body}`) }),
      ],
    })
    expect(await tidyMemory(now)).toMatchObject({ merged: 1 })
    const kept = await prisma.memoryItem.findFirstOrThrow({ where: { key: 'release-day' } })
    expect(kept.body).toBe(`${release.body}\n${weekly.body}`)
    expect(kept).toMatchObject({ archived: false, embeddingModel: null })
    expect(await prisma.memoryItem.findFirstOrThrow({ where: { key: 'weekly-release', scope: 'PERSON' } })).toMatchObject({ archived: true })
    expect(await prisma.memoryItem.findFirstOrThrow({ where: { key: 'weekly-release', scope: 'AGENT_PERSON' } })).toMatchObject({ archived: false })
  })

  it('leaves an item alone when it was written after the tidy read it', async () => {
    const older = await prisma.memoryItem.create({ data: row('older', { updatedAt: new Date(now.getTime() - DAY) }) })
    const newer = await prisma.memoryItem.create({ data: row('newer') })
    const readAt = new Map([[older.id, older.updatedAt], [newer.id, newer.updatedAt]])
    await prisma.memoryItem.update({ where: { id: older.id }, data: { body: 'The person just changed this.' } })

    const applied = await applyChange({ kind: 'merge', into: older.id, body: 'merged', tags: [], archive: newer.id, pin: false }, readAt)

    expect(applied).toBe(false)
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: older.id } })).toMatchObject({ body: 'The person just changed this.' })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: newer.id } })).toMatchObject({ archived: false })
  })

  it('removes the memory of a project that no longer exists', async () => {
    const shop = await createProject({ name: 'Shop' })
    const place = (id: string) => ({ scope: 'AGENT_PLACE' as const, scopeKey: `agent-place:${scout}:project:${id}`, userId: null, agentId: scout, placeType: 'project' as const, placeId: id })
    await prisma.memoryItem.createMany({ data: [row('kept', place(shop.id)), row('gone', place('project-deleted'))] })
    expect(await tidyMemory(now)).toMatchObject({ removed: 1 })
    expect((await prisma.memoryItem.findMany({ select: { key: true } })).map(r => r.key)).toEqual(['kept'])
  })
})
