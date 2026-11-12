/**
 * `remember`, `forget` and `recall` against the real test database, under the one rule for who they are for
 * (memory/principal.ts): the person who commissioned the work, the agent and its place, which is also where a memory
 * it saves holds (ADR-0188); work for no person is refused, with the reason; a connection is no agent. The fake
 * embedder stands in for the model.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createTestTask, createUser, createConversation } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../memory/embedding/embedders', () => import('../../../test/fakes/embedders'))

import { forgetOp, recallOp, rememberOp } from '../memoryOps'
import { callOperation } from '../operations'
import { ControlPlaneError, type CallerContext } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { claims } from './controlPlaneFixtures'
import { turnCaller } from './turnFixtures'

let alice: string
let bob: string
let scout: string
let shop: string

const tea = { title: 'Tea', body: 'Prefers green tea to coffee in the afternoon.', kind: 'rule' as const }
const release = { title: 'Release day', body: 'The person ships the weekly release on Thursday afternoons.', kind: 'fact' as const }

/** A chat in Alice's own space, which she started. */
const chat = (over: Partial<CapabilityClaims> = {}): CallerContext =>
  ({ kind: 'run', claims: claims({ userId: alice, agentId: scout, runner: { kind: 'person', userId: alice }, ...over }) })

async function refusal(promise: Promise<unknown>): Promise<ControlPlaneError> {
  const err = await promise.catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ControlPlaneError)
  return err as ControlPlaneError
}

beforeEach(async () => {
  alice = (await createUser()).id
  bob = (await createUser()).id
  scout = (await createAgent()).id
  shop = (await createProject({ name: 'Shop' })).id
  await prisma.agentSession.upsert({ where: { id: 's1' }, update: { userId: alice, agentId: scout }, create: { id: 's1', userId: alice, agentId: scout, sessionType: 'chat' } })
})

describe('a run with a person it is for @SC-2102 @SC-990', () => {
  it("remembers for the chat's person, its own agent and its place, whatever the arguments name", async () => {
    const result = await rememberOp(chat(), { ...tea, userId: bob, agentId: 'other', scope: 'person' } as never)
    expect(result).toMatchObject({ status: 'added', key: 'tea', requested: false })
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({
      scopeKey: `person:${alice}/agent:${scout}/place:user:${alice}`, userId: alice, agentId: scout, placeType: 'user', placeId: alice,
      writtenByAgentId: scout, kind: 'RULE',
    })
  })

  it('keeps a memory saved in a project to that project: a chat there saves it there', async () => {
    await rememberOp(chat({ projectId: shop }), release)
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({ userId: alice, placeType: 'project', placeId: shop })
    expect((await recallOp(chat(), { key: 'release-day' })).items).toEqual([])
    expect((await recallOp(chat({ projectId: shop }), { key: 'release-day' })).items).toHaveLength(1)
  })

  it('still reads the deprecated kinds and scope', async () => {
    await rememberOp(chat(), { ...release, kind: 'project', scope: 'agent_place' })
    await rememberOp(chat(), { ...tea, kind: 'preference', scope: 'person' })
    expect((await prisma.memoryItem.findMany({ orderBy: { key: 'asc' } })).map(r => [r.key, r.kind])).toEqual([['release-day', 'FACT'], ['tea', 'RULE']])
  })

  it('says whether the person asked for it', async () => {
    expect(await rememberOp(chat(), { ...tea, requested: true })).toMatchObject({ requested: true, itemId: expect.any(String) })
  })

  it('recalls by key, by query, and by kind alone, and records the recall', async () => {
    await rememberOp(chat(), tea)
    expect((await recallOp(chat(), { key: 'tea' })).items.map(i => i.title)).toEqual(['Tea'])
    const { items, cut } = await recallOp(chat(), { query: 'does the person prefer tea or coffee' })
    expect(items).toEqual([expect.objectContaining({ key: 'tea', kind: 'rule' })])
    expect(cut).toEqual([])
    expect((await recallOp(chat(), { kind: 'rule' })).items.map(i => i.key)).toEqual(['tea'])
    expect(await prisma.memoryOutcome.count({ where: { kind: 'RECALLED' } })).toBe(3)
  })

  it('forgets by key, with the deprecated scope read and ignored', async () => {
    await rememberOp(chat(), tea)
    expect(await forgetOp(chat(), { key: 'tea', scope: 'agent_place' })).toEqual({ forgotten: true })
    expect(await forgetOp(chat(), { key: 'tea' })).toEqual({ forgotten: false })
  })

  it("a person's own Run of a task, in their own home, is for that person", async () => {
    const task = await createTestTask({ data: { title: 'T', projectId: shop, number: 1, onBehalfOfUserId: bob } })
    const run: CallerContext = { kind: 'run', claims: claims({ userId: alice, agentId: scout, projectId: shop, taskId: task.id, runner: { kind: 'person', userId: alice }, startedBy: 'person', onBehalfOfUserId: alice, role: null }) }
    await rememberOp(run, tea)
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({ userId: alice })
  })

  it("a task run in the project's home, which every member's task runs share, is refused: it is for no person", async () => {
    const task = await createTestTask({ data: { title: 'T', projectId: shop, number: 1, onBehalfOfUserId: alice } })
    const run: CallerContext = { kind: 'run', claims: claims({ userId: 'routing-admin', agentId: scout, projectId: shop, taskId: task.id, runner: { kind: 'project', projectId: shop }, startedBy: 'person', onBehalfOfUserId: alice, role: null }) }
    await rememberOp(chat({ projectId: shop }), tea)
    expect((await refusal(rememberOp(run, { ...tea, key: 'coffee' }))).message).toMatch(/not for any person/)
    expect((await refusal(recallOp(run, { key: 'tea' }))).message).toMatch(/not for any person/)
    expect((await refusal(forgetOp(run, { key: 'tea' }))).code).toBe('forbidden')
    expect(await prisma.memoryItem.count()).toBe(1)
  })

  it('refuses an item that cannot stand alone, saying why', async () => {
    const err = await refusal(rememberOp(chat(), { ...tea, title: 'That', body: 'Do it like that again.' }))
    expect(err.code).toBe('invalid')
    expect(err.message).toMatch(/stand alone/)
  })

  it('refuses a person who has left the organisation', async () => {
    await prisma.user.update({ where: { id: alice }, data: { deactivatedAt: new Date() } })
    expect((await refusal(recallOp(chat(), { query: 'tea' }))).code).toBe('forbidden')
  })

  it('recall takes a key, or a query and filters', async () => {
    expect((await refusal(recallOp(chat(), {}))).code).toBe('invalid')
    expect((await refusal(recallOp(chat(), { key: 'tea', query: 'tea' }))).code).toBe('invalid')
  })
})

describe('a run nobody commissioned @SC-2102 @SC-990', () => {
  const pulse = (): CallerContext =>
    ({ kind: 'run', claims: claims({ userId: 'routing-admin', agentId: scout, projectId: shop, taskId: 'task-x', runner: { kind: 'project', projectId: shop }, startedBy: 'pulse', role: null }) })

  it('is refused every memory tool, with the reason: there is no memory without a person', async () => {
    await rememberOp(chat({ projectId: shop }), tea)
    expect((await refusal(rememberOp(pulse(), release))).message).toMatch(/not for any person/)
    expect((await refusal(recallOp(pulse(), { key: 'tea' }))).code).toBe('forbidden')
    expect((await refusal(callOperation('recall', pulse(), { query: 'weekly release Thursday' }))).code).toBe('forbidden')
  })
})

describe('other callers @SC-2102 @SC-990', () => {
  it('a connection is refused: memory is an agent\'s, and a connection is no agent', async () => {
    expect((await refusal(rememberOp(connectionCaller({ userId: alice }), tea))).code).toBe('forbidden')
    expect((await refusal(recallOp(connectionCaller({ userId: alice }), { query: 'tea' }))).code).toBe('forbidden')
  })

  it("a conversation's turn is for the person whose message it answers, in the conversation's place", async () => {
    // The turn's conversation is real: a memory records the conversation it was saved in.
    await createConversation({ id: 'conv-1', openedById: alice, agentId: scout })
    await rememberOp(turnCaller({ actingUserId: alice, agentId: scout, home: 'PROJECT', projectId: shop }), release)
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({ userId: alice, placeType: 'project', placeId: shop, agentId: scout })
    await rememberOp(turnCaller({ actingUserId: alice, agentId: scout }), tea)
    expect((await recallOp(chat(), { key: 'tea' })).items).toHaveLength(1)
    expect(await prisma.memoryOutcome.findFirstOrThrow()).toMatchObject({ conversationId: null })
    await recallOp(turnCaller({ actingUserId: alice, agentId: scout }), { key: 'tea' })
    expect(await prisma.memoryOutcome.findFirstOrThrow({ where: { conversationId: 'conv-1' } })).toMatchObject({ turnId: 'turn-1' })
  })

  it('a turn that answers no one only reads', async () => {
    const reader = turnCaller({ actingUserId: null, readerUserId: alice, agentId: scout, home: 'PROJECT', projectId: shop })
    expect((await refusal(rememberOp(reader, release))).message).toMatch(/may only read/)
  })

  it("a task's thread, which its project's members read, reaches no person's memory", async () => {
    const thread = turnCaller({ actingUserId: alice, agentId: scout, home: 'TASK', projectId: shop, taskId: 'task-1' })
    expect((await refusal(rememberOp(thread, tea))).message).toMatch(/not for any person/)
  })
})
