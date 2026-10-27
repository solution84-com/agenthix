import { describe, it, expect, vi, afterEach } from 'vitest'
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'
import { createEmbedBatch } from '../embedBatch'

const loc = { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null } as const
const place = (path: string): SiteFileRef => ({ space: 'place', loc, path })
const pathOf = (r: SiteFileRef) => (r.space === 'place' ? r.path : '')

afterEach(() => vi.useRealTimers())

describe('one request for the embeds on screen @SC-1551', () => {
  it('opens the embeds asked for together in one call, each file once, answering each asker', async () => {
    vi.useFakeTimers()
    const openMany = vi.fn(async (files: SiteFileRef[]): Promise<FileOpenAnswer[]> =>
      files.map(f => (pathOf(f) === 'gone.png' ? { state: 'not-found' } : { state: 'site-unavailable' })))
    const batch = createEmbedBatch(openMany)
    const all = Promise.all([batch.open(place('a.png')), batch.open(place('gone.png')), batch.open(place('a.png'))])
    await vi.runAllTimersAsync()
    expect(await all).toEqual([{ state: 'site-unavailable' }, { state: 'not-found' }, { state: 'site-unavailable' }])
    expect(openMany).toHaveBeenCalledTimes(1)
    expect(openMany.mock.calls[0][0].map(pathOf)).toEqual(['a.png', 'gone.png'])
  })

  it('asks again for embeds that come into view later', async () => {
    vi.useFakeTimers()
    const openMany = vi.fn(async (files: SiteFileRef[]): Promise<FileOpenAnswer[]> => files.map(() => ({ state: 'not-found' })))
    const batch = createEmbedBatch(openMany)
    const first = batch.open(place('a.png'))
    await vi.runAllTimersAsync()
    await first
    const second = batch.open(place('a.png'))
    await vi.runAllTimersAsync()
    await second
    expect(openMany).toHaveBeenCalledTimes(2)
  })

  it('answers every embed as unavailable when the request fails', async () => {
    vi.useFakeTimers()
    const batch = createEmbedBatch(async () => { throw new Error('offline') })
    const answer = batch.open(place('a.png'))
    await vi.runAllTimersAsync()
    expect(await answer).toEqual({ state: 'site-unavailable' })
  })

  it('splits a very long page into calls the action accepts', async () => {
    vi.useFakeTimers()
    const openMany = vi.fn(async (files: SiteFileRef[]): Promise<FileOpenAnswer[]> => files.map(() => ({ state: 'not-found' })))
    const batch = createEmbedBatch(openMany)
    const all = Promise.all(Array.from({ length: 120 }, (_, i) => batch.open(place(`${i}.png`))))
    await vi.runAllTimersAsync()
    await all
    expect(openMany.mock.calls.map(c => c[0].length)).toEqual([50, 50, 20])
  })
})
