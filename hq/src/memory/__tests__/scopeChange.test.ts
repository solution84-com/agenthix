/** Promoting a memory and flipping it back, and a key already held where it moves (ADR-0188; spec, The memory record). */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { fakeVector } from '../../test/fakes/embedders'
import { SAVING_AGENT_GONE, clashAction, freeKey, scopeFor } from '../scopeChange'

const row = { userId: 'u1', writtenByAgentId: 'kernel', savedInPlaceType: 'project' as const, savedInPlaceId: 'shop' }

describe('the two switches @SC-2107', () => {
  it('flip between the saving agent and every agent, and the saved-in place and everywhere', () => {
    expect(scopeFor(row, { agent: 'saved', place: 'saved' })).toEqual({ scope: { person: 'u1', agent: 'kernel', place: { type: 'project', id: 'shop' } } })
    expect(scopeFor(row, { agent: 'every', place: 'saved' })).toEqual({ scope: { person: 'u1', agent: null, place: { type: 'project', id: 'shop' } } })
    expect(scopeFor(row, { agent: 'saved', place: 'everywhere' })).toEqual({ scope: { person: 'u1', agent: 'kernel', place: null } })
    expect(scopeFor(row, { agent: 'every', place: 'everywhere' })).toEqual({ scope: { person: 'u1', agent: null, place: null } })
  })

  it('never change the person', () => {
    const planned = scopeFor(row, { agent: 'every', place: 'everywhere' })
    expect('scope' in planned && planned.scope.person).toBe('u1')
  })

  it('cannot flip back to an agent or a place since deleted', () => {
    expect(scopeFor({ ...row, writtenByAgentId: null }, { agent: 'saved', place: 'everywhere' })).toEqual({ refused: SAVING_AGENT_GONE })
    expect(scopeFor({ ...row, savedInPlaceType: null, savedInPlaceId: null }, { agent: 'every', place: 'saved' })).toEqual({ scope: { person: row.userId, agent: null, place: null } })
    expect(scopeFor({ ...row, writtenByAgentId: null }, { agent: 'every', place: 'everywhere' })).toMatchObject({ scope: { agent: null } })
  })
})

describe('a key already held where the memory moves @SC-2107', () => {
  const text = (body: string) => ({ body, embedding: fakeVector(body), embeddingModel: 'local' })
  const held = { kind: 'FACT' as const, ...text('The person drinks green tea in the afternoon while reading the reports at work.') }

  it('is the near-duplicate rule when the two are alike', () => {
    expect(clashAction({ kind: 'FACT', ...text('The person drinks green tea in the afternoon while reading the reports.') }, held)).toEqual({ action: 'held' })
    expect(clashAction({ kind: 'RULE', ...text('The person drinks green tea in the afternoon while reading the reports at work, always.') }, { ...held, kind: 'RULE' }))
      .toEqual({ action: 'supersede' })
  })

  it('treats an archived memory holding the key as absent: the archived one takes a numbered key, alike or not', () => {
    expect(clashAction({ kind: 'FACT', ...text('The person drinks green tea in the afternoon while reading the reports.') }, { ...held, archived: true }))
      .toEqual({ action: 'renumber-archived' })
    expect(clashAction({ kind: 'FACT', ...text('Something else entirely about deploys on Fridays.') }, { ...held, archived: true }))
      .toEqual({ action: 'renumber-archived' })
  })

  it('takes a numbered key when they are not alike, or cannot be compared', () => {
    expect(clashAction({ kind: 'FACT', ...text('Something else entirely about deploys on Fridays.') }, held)).toEqual({ action: 'renumber' })
    expect(clashAction({ ...held, embeddingModel: null }, held)).toEqual({ action: 'renumber' })
  })

  it('numbers the key with the smallest number free, within the key length', () => {
    expect(freeKey('tea', new Set(['tea']))).toBe('tea-2')
    expect(freeKey('tea', new Set(['tea', 'tea-2', 'tea-3']))).toBe('tea-4')
    const long = 'k'.repeat(64)
    expect(freeKey(long, new Set([long]))).toBe(`${'k'.repeat(62)}-2`)
  })
})
