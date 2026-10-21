import { describe, it, expect, vi } from 'vitest'
import type { RunRow } from '@agenthix/core'
import { excerptOf, searchRuns, type SearchedOperation } from '../runSearch'

const run = (id: string, over: Partial<RunRow>): RunRow => ({ id, sessionId: `s-${id}`, inputText: '', outputText: null, startedAt: '2026-10-09T10:00:00.000Z', ...over }) as RunRow
const op = (siteId: string, runId: string): SearchedOperation => ({ siteId, runId, title: `Work ${runId}`, at: new Date('2026-10-09T09:00:00.000Z') })

describe('finding what a conversation\'s runs said @SC-973', () => {
  it('quotes the words around the match, in what the run answered or was asked', () => {
    expect(excerptOf({ inputText: 'Profile the image pipeline', outputText: null }, 'pipeline')).toBe('Profile the image pipeline')
    expect(excerptOf({ inputText: 'x', outputText: `${'a '.repeat(100)}the cache was cold${' b'.repeat(100)}` }, 'CACHE')).toMatch(/^….*the cache was cold.*…$/)
    expect(excerptOf({ inputText: 'x', outputText: 'y' }, 'cache')).toBeNull()
    expect(excerptOf({ inputText: 'x', outputText: 'y' }, '  ')).toBeNull()
  })

  it('asks no site when nothing is searched', async () => {
    const getRun = vi.fn()
    expect(await searchRuns([op('s1', 'r1')], '  ', { getRun, siteName: async () => 'x' })).toEqual({ hits: [], unavailable: [] })
    expect(getRun).not.toHaveBeenCalled()
  })

  it('returns the runs that said it, newest first, and names a site that could not answer', async () => {
    const runs: Record<string, RunRow> = {
      r1: run('r1', { outputText: 'The cache was cold', startedAt: '2026-10-09T10:00:00.000Z' }),
      r2: run('r2', { outputText: 'Cache warmed', startedAt: '2026-10-09T11:00:00.000Z' }),
      r3: run('r3', { outputText: 'unrelated' }),
    }
    const getRun = vi.fn(async (siteId: string, runId: string) => {
      if (siteId === 'down') throw new Error('unreachable')
      return runs[runId] ?? null
    })
    const result = await searchRuns([op('up', 'r1'), op('up', 'r2'), op('up', 'r3'), op('down', 'r4')], 'cache', {
      getRun, siteName: async (id) => (id === 'down' ? 'Office Mac' : id),
    })
    expect(result.hits.map(h => h.runId)).toEqual(['r2', 'r1'])
    expect(result.hits[0]).toMatchObject({ sessionId: 's-r2', siteId: 'up', title: 'Work r2' })
    expect(result.unavailable).toEqual(['Office Mac'])
  })
})
