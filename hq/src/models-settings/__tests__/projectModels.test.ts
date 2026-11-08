/** A project's list starts with the models its agents use now, once, when first switched to Only these. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ projectAgent: { findMany: vi.fn() } }))
vi.mock('wasp/server', () => ({ prisma: db }))
const decide = vi.hoisted(() => vi.fn())
vi.mock('../../routing/decide', () => ({ decide }))
vi.mock('../../routing/snapshot', () => ({ readSnapshot: vi.fn().mockResolvedValue({}) }))
vi.mock('../../routing/place', () => ({ placeOfProject: vi.fn().mockResolvedValue({ kind: 'project', projectId: 'p1' }) }))

import { allowedLine, modelsInUse, withModelsInUse } from '../projectModels'
import type { ListView, ReachableModel } from '../types'

const reachable: ReachableModel[] = [
  { key: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', maker: 'DeepSeek', via: ['OpenRouter'], price: 1 },
]
const view = (over: Partial<ListView> = {}): ListView => ({ owner: 'project', ownerId: 'p1', mode: 'every', entries: [], reachable: 1, allowedAbove: 1, allowed: 1, ...over })

beforeEach(() => vi.clearAllMocks())

describe('the models a project\'s agents use now', () => {
  it('lists the one default model of each agent, each model once', async () => {
    db.projectAgent.findMany.mockResolvedValue([{ agentId: 'a1' }, { agentId: 'a2' }])
    decide.mockReturnValue({ ok: true, resolution: { vendor: 'openrouter', model: { providerId: 'x', model: 'deepseek/deepseek-v4.1-flash' } } })
    expect(await modelsInUse('p1')).toEqual(['deepseek/deepseek-v4.1-flash'])
    expect(decide).toHaveBeenCalledTimes(2)
  })

  it('leaves out a model that cannot be resolved', async () => {
    db.projectAgent.findMany.mockResolvedValue([{ agentId: 'a1' }])
    decide.mockReturnValue({ ok: false, problem: {} })
    expect(await modelsInUse('p1')).toEqual([])
  })
})

describe('the first switch to Only these', () => {
  const sent = { mode: 'only_these' as const, entries: [] }
  it('is pre-filled with the models in use', () => {
    expect(withModelsInUse(sent, 'every', ['a/b'])).toEqual({ mode: 'only_these', entries: [{ effect: 'allow', pattern: 'a/b' }] })
  })
  it('keeps the bans already on the list', () => {
    const withNever = { mode: 'only_these' as const, entries: [{ effect: 'never' as const, pattern: 'x/*' }] }
    expect(withModelsInUse(withNever, 'every', ['a/b']).entries).toEqual([{ effect: 'allow', pattern: 'a/b' }, { effect: 'never', pattern: 'x/*' }])
  })
  it('does not refill a list already Only these (emptying it is the person\'s choice)', () => {
    expect(withModelsInUse(sent, 'only_these', ['a/b'])).toBe(sent)
  })
  it('saves a list that names what it allows as sent', () => {
    const named = { mode: 'only_these' as const, entries: [{ effect: 'allow' as const, pattern: 'c/d' }] }
    expect(withModelsInUse(named, 'every', ['a/b'])).toBe(named)
  })
  it('does nothing for the other mode', () => {
    const every = { mode: 'every' as const, entries: [] }
    expect(withModelsInUse(every, 'only_these', ['a/b'])).toBe(every)
  })
})

describe('the line a member reads', () => {
  it('says what the organisation allows when nothing narrows it', () => {
    expect(allowedLine(view(), reachable, 'Fernhill')).toBe('Any model Fernhill allows')
  })
  it('names the models of Only these and the ones never allowed', () => {
    const v = view({ mode: 'only_these', entries: [
      { effect: 'allow', pattern: 'deepseek/deepseek-v4.1-flash', covers: 1, kind: 'model', meaning: 'One model' },
      { effect: 'never', pattern: 'xai/*', covers: 0, kind: 'maker', meaning: '' },
    ] })
    expect(allowedLine(v, reachable, 'Fernhill')).toBe('Only DeepSeek V4.1 Flash, never xai/*')
  })
})
