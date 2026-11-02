/**
 * A live preview coming back after its pause (live preview spec section 4, *States*): after a restart its container is
 * made again while it still reads as paused, and the guard takes that container as the site's own while it is made;
 * one that cannot come back stops as `failed`, and only a paused container that no longer matches its template is the
 * guard's finding.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LivePreviewState } from '@agenthix/core'
import type { LivePreviewRow } from '../livePreviewRows'

const rows = vi.hoisted(() => new Map<string, unknown>())
const docker = vi.hoisted(() => ({ start: vi.fn(), unpause: vi.fn(), seenWhileMaking: [] as boolean[] }))
const guard = vi.hoisted(() => ({ healthy: true, watch: vi.fn(async () => {}), unwatch: vi.fn() }))

vi.mock('../livePreviewStore', () => {
  const change = async (id: string, fn: (row: unknown) => { row: unknown; result: unknown }) => {
    const { row, result } = fn(rows.get(id) ?? null)
    if (row) rows.set(id, row)
    return result
  }
  return {
    changeLivePreview: change,
    livePreviewRow: async (id: string) => rows.get(id) ?? null,
    moveState: (id: string, next: (row: { state: LivePreviewState }) => LivePreviewState | null) => change(id, row => {
      const r = row as { state: LivePreviewState } | null
      if (!r || r.state.state === 'stopped') return { row: null, result: null }
      const state = next(r)
      return state ? { row: { ...r, state }, result: { ...r, state } } : { row: null, result: null }
    }),
    onLivePreviewChange: () => () => {},
  }
})
vi.mock('../livePreviewRuntime', () => ({ apps: { previewChanged: () => {} }, currentGuard: () => guard }))
vi.mock('../livePreviewSeams', () => ({ seams: { services: { stopAll: async () => {} }, installs: { forget: () => {} } } }))
vi.mock('../livePreviewActivity', () => ({ lastAuthors: () => null }))
vi.mock('../livePreviewCopies', () => ({
  copyPlaceOf: () => ({ hostDir: '/site/clones/c1', containerDir: '/projects/pr1/clones/c1' }),
  ownCopyHead: async () => null, previewHelper: async () => {}, removeOwnCopy: async () => {},
}))
vi.mock('../secrets/previewMasks', () => ({ forgetPreviewMask: () => {} }))
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: { sendEvent: () => {} } }))
vi.mock('../container/container', async importOriginal => {
  const real = await importOriginal<typeof import('../container/container')>()
  return {
    ContainerRefused: real.ContainerRefused,
    expectContainers: real.expectContainers,
    containersExpected: real.containersExpected,
    startContainer: async (lp: { id: string }) => {
      docker.seenWhileMaking.push(real.containersExpected(lp.id))
      return docker.start(lp)
    },
    unpauseContainers: (id: string) => docker.unpause(id),
    pauseContainers: async () => {},
    removeEverything: async () => {},
    stopContainers: async () => {},
  }
})

const { resumePreview } = await import('../livePreviewLife')
const { containersExpected, ContainerRefused } = await import('../container/container')

function paused(id: string, containersRemoved: boolean): LivePreviewRow {
  const row = {
    id, projectId: 'pr1', personId: 'p1', ownerType: 'project', ownerId: 'pr1', workspaceId: 'w1', branch: `b-${id}`, onMain: false,
    copyKind: 'branch', copyId: 'c1', baseCommit: null, headCommit: null, openedAt: new Date().toISOString(),
    state: { state: 'paused', since: new Date().toISOString(), reason: 'lineLost', signal: null, detail: 'line' },
    runs: [], pending: null, containersRemoved,
  } as LivePreviewRow
  rows.set(id, row)
  return row
}

const stateOf = (id: string) => (rows.get(id) as LivePreviewRow).state

beforeEach(() => {
  rows.clear()
  docker.start.mockReset().mockResolvedValue({ containerId: 'x', name: 'n' })
  docker.unpause.mockReset().mockResolvedValue(undefined)
  docker.seenWhileMaking.length = 0
  guard.watch.mockClear()
})

describe('a live preview coming back after a restart @SC-1739', () => {
  it('makes its container again as the site\'s own, until the guard watches it, and runs', async () => {
    const back = await resumePreview(paused('a', true))
    expect(docker.seenWhileMaking).toEqual([true])
    expect(guard.watch).toHaveBeenCalledWith({ id: 'a', projectId: 'pr1', paused: false })
    expect(containersExpected('a')).toBe(false)
    expect(back?.state.state).toBe('running')
    expect(back?.containersRemoved).toBe(false)
  })

  it('brings two back, each running', async () => {
    await Promise.all([resumePreview(paused('a', true)), resumePreview(paused('b', true))])
    expect(stateOf('a').state).toBe('running')
    expect(stateOf('b').state).toBe('running')
    expect(docker.seenWhileMaking).toEqual([true, true])
  })

  it('stops as failed, not as the guard\'s, when its container cannot be made again', async () => {
    docker.start.mockRejectedValueOnce(new Error('docker start: container is marked for removal and cannot be started'))
    expect(await resumePreview(paused('a', true))).toBeNull()
    expect(stateOf('a')).toMatchObject({ state: 'stopped', reason: 'failed', signal: null })
    expect(containersExpected('a')).toBe(false)
  })

  it('stops as the guard\'s when its paused container no longer matches its template', async () => {
    docker.unpause.mockRejectedValueOnce(new ContainerRefused(['mounts'], 'changed while paused'))
    expect(await resumePreview(paused('a', false))).toBeNull()
    expect(stateOf('a')).toMatchObject({ state: 'stopped', reason: 'guard', signal: 'offTemplate' })
  })

  it('stops as failed when Docker will not let a paused container run again', async () => {
    docker.unpause.mockRejectedValueOnce(new Error('Cannot connect to the Docker daemon'))
    await resumePreview(paused('a', false))
    expect(stateOf('a')).toMatchObject({ state: 'stopped', reason: 'failed' })
  })
})
