/**
 * `remember`, `forget` and `recall` against the real test database, under the one rule for who they are for
 * (memory/principal.ts): the person who commissioned the work and its place; a run nobody commissioned reaches
 * its place's memory only; a connection is no agent. The fake embedder stands in for the model.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createTestTask, createUser } from '../../../test/factories'

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

const tea = { scope: 'person' as const, title: 'Tea', body: 'Prefers green tea to coffee in the afternoon.', kind: 'preference' as const }
const release = { scope: 'agent_place' as const, title: 'Release day', body: 'The team ships the weekly release on Thursday afternoons.', kind: 'fact' as const }

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

describe('a run with a person it is for @SC-986 @SC-990', () => {
  it("remembers for the chat's person and its own agent, whatever the arguments name", async () => {
    const result = await rememberOp(chat(), { ...tea, userId: bob, agentId: 'other' } as never)
    expect(result).toEqual({ status: 'added', key: 'tea', scope: 'person' })
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({ scopeKey: `person:${alice}`, userId: alice, writtenByAgentId: scout })
  })

  it('keeps what it learns about a place in that place: a chat in a project writes the project\'s', async () => {
    await rememberOp(chat({ projectId: shop }), release)
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({ scope: 'AGENT_PLACE', placeType: 'project', placeId: shop })
    await rememberOp(chat(), { ...release, title: 'Own release day' })
    expect(await prisma.memoryItem.findFirstOrThrow({ where: { key: 'own-release-day' } })).toMatchObject({ placeType: 'user', placeId: alice })
  })

  it('recalls by key and by query, and records the recall', async () => {
    await rememberOp(chat(), tea)
    expect((await recallOp(chat(), { key: 'tea' })).items.map(i => i.title)).toEqual(['Tea'])
    const { items, cut } = await recallOp(chat(), { query: 'does the person prefer tea or coffee' })
    expect(items).toEqual([expect.objectContaining({ key: 'tea', scope: 'person', kind: 'preference' })])
    expect(cut).toEqual([])
    expect(await prisma.memoryOutcome.count({ where: { kind: 'RECALLED' } })).toBe(2)
  })

  it('forgets by key and scope', async () => {
    await rememberOp(chat(), tea)
    expect(await forgetOp(chat(), { key: 'tea', scope: 'person' })).toEqual({ forgotten: true })
    expect(await forgetOp(chat(), { key: 'tea', scope: 'person' })).toEqual({ forgotten: false })
  })

  it("a person's own Run of a task, in their own home, is for that person", async () => {
    const task = await createTestTask({ data: { title: 'T', projectId: shop, number: 1, onBehalfOfUserId: bob } })
    const run: CallerContext = { kind: 'run', claims: claims({ userId: alice, agentId: scout, projectId: shop, taskId: task.id, runner: { kind: 'person', userId: alice }, startedBy: 'person', onBehalfOfUserId: alice, role: null }) }
    await rememberOp(run, tea)
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({ userId: alice })
  })

  it("a task run in the project's home, which every member's task runs share, reaches no person's memory", async () => {
    const task = await createTestTask({ data: { title: 'T', projectId: shop, number: 1, onBehalfOfUserId: alice } })
    const run: CallerContext = { kind: 'run', claims: claims({ userId: 'routing-admin', agentId: scout, projectId: shop, taskId: task.id, runner: { kind: 'project', projectId: shop }, startedBy: 'person', onBehalfOfUserId: alice, role: null }) }
    await rememberOp(chat(), tea)
    expect((await refusal(rememberOp(run, { ...tea, key: 'coffee' }))).message).toMatch(/not for any person/)
    expect((await recallOp(run, { key: 'tea' })).items).toEqual([])
    expect(await rememberOp(run, release)).toMatchObject({ status: 'added', scope: 'agent_place' })
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

  it('recall takes a key or a query, one of the two', async () => {
    expect((await refusal(recallOp(chat(), {}))).code).toBe('invalid')
    expect((await refusal(recallOp(chat(), { key: 'tea', query: 'tea' }))).code).toBe('invalid')
  })
})

describe('a run nobody commissioned @SC-986 @SC-990', () => {
  const pulse = (): CallerContext =>
    ({ kind: 'run', claims: claims({ userId: 'routing-admin', agentId: scout, projectId: shop, taskId: 'task-x', runner: { kind: 'project', projectId: shop }, startedBy: 'pulse', role: null }) })

  it("reaches its place's memory only: no person's, though its task has a person", async () => {
    await rememberOp(chat(), tea)
    const err = await refusal(rememberOp(pulse(), tea))
    expect(err.message).toMatch(/not for any person/)
    expect(await rememberOp(pulse(), release)).toMatchObject({ status: 'added', scope: 'agent_place' })
    expect((await recallOp(pulse(), { key: 'tea' })).items).toEqual([])
    expect((await recallOp(pulse(), { key: 'release-day' })).items).toHaveLength(1)
  })

  it('reaches the memory tools through the registry, which asks no person of them', async () => {
    await rememberOp(pulse(), release)
    const result = await callOperation('recall', pulse(), { query: 'weekly release Thursday' }) as { items: { key: string }[] }
    expect(result.items.map(i => i.key)).toEqual(['release-day'])
  })
})

describe('other callers @SC-986 @SC-990', () => {
  it('a connection is refused: memory is an agent\'s, and a connection is no agent', async () => {
    expect((await refusal(rememberOp(connectionCaller({ userId: alice }), tea))).code).toBe('forbidden')
    expect((await refusal(recallOp(connectionCaller({ userId: alice }), { query: 'tea' }))).code).toBe('forbidden')
  })

  it("a conversation's turn is for the person whose message it answers, in the conversation's place", async () => {
    await rememberOp(turnCaller({ actingUserId: alice, agentId: scout, home: 'PROJECT', projectId: shop }), release)
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({ placeType: 'project', placeId: shop, agentId: scout })
    await rememberOp(turnCaller({ actingUserId: alice, agentId: scout }), tea)
    expect((await recallOp(chat(), { key: 'tea' })).items).toHaveLength(1)
    expect(await prisma.memoryOutcome.findFirstOrThrow()).toMatchObject({ conversationId: null })
    await recallOp(turnCaller({ actingUserId: alice, agentId: scout }), { key: 'tea' })
    expect(await prisma.memoryOutcome.findFirstOrThrow({ where: { conversationId: 'conv-1' } })).toMatchObject({ turnId: 'turn-1' })
  })

  it('a turn that answers no one only reads', async () => {
    const reader = turnCaller({ actingUserId: null, readerUserId: alice, agentId: scout, home: 'PROJECT', projectId: shop })
    expect((await refusal(rememberOp(reader, release))).message).toMatch(/may only read/)
    await rememberOp(turnCaller({ actingUserId: alice, agentId: scout, home: 'PROJECT', projectId: shop }), release)
    expect((await recallOp(reader, { key: 'release-day' })).items).toHaveLength(1)
  })
})
