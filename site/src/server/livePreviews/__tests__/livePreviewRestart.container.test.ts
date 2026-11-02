/**
 * Two live previews survive a site restart (live preview spec section 4, *States*; phase 2's proof, Q11), for real:
 * both containers are made and watched, the "restart" forgets what the process made and removes every live preview's
 * container, and once hq's line is up the guard brings both back, one after the other, each with a fresh container that
 * matches its template. While the second one's container is made, the first one's watch already hears Docker: the
 * guard must take that container as the site's own, not remove it as no one's.
 *
 * Run with `npm run test:container` from site/. Needs Docker and the agent image (`agenthix-agent:latest` unless
 * AGENT_IMAGE says otherwise); skipped when either is missing. Two containers and their networks, named
 * `<LIVE_PREVIEW_TEST_NAMESPACE>-*` (`lp-restart-test-*` unless set), each capped at 2 GB and 2 processors, removed at
 * the end. The store and hq's line are stand-ins; the containers, Docker's events, the guard and the life cycle are
 * the site's own.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { LivePreviewRow } from '../livePreviewRows'

process.env.HOST_NAMESPACE = process.env.LIVE_PREVIEW_TEST_NAMESPACE?.trim() || 'lp-restart-test'
process.env.AGENT_NETWORK_RANGE = process.env.LIVE_PREVIEW_TEST_RANGE ?? '10.231.0.0/20'
process.env.AGENT_CONTAINER_MEMORY = '2g'
process.env.AGENT_CONTAINER_CPUS = '2'
delete process.env.SITE_CONTAINER_NAME

const image = process.env.AGENT_IMAGE?.trim() || 'agenthix-agent:latest'
const ready = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }).status === 0

const rows = vi.hoisted(() => new Map<string, unknown>())
const copies = vi.hoisted(() => new Map<string, { hostDir: string; containerDir: string }>())

vi.mock('../livePreviewStore', async importOriginal => {
  const real = await importOriginal<typeof import('../livePreviewStore')>()
  type Row = { state: { state: string } }
  const change = async (id: string, fn: (row: unknown) => { row: unknown; result: unknown }) => {
    const { row, result } = fn(rows.get(id) ?? null)
    if (row) rows.set(id, row)
    return result
  }
  return {
    ...real,
    changeLivePreview: change,
    livePreviewRow: async (id: string) => rows.get(id) ?? null,
    liveLivePreviews: async () => [...rows.values()].filter(r => (r as Row).state.state !== 'stopped'),
    moveState: (id: string, next: (row: Row) => unknown) => change(id, row => {
      const r = row as Row | null
      if (!r || r.state.state === 'stopped') return { row: null, result: null }
      const state = next(r)
      return state ? { row: { ...r, state }, result: { ...r, state } } : { row: null, result: null }
    }),
    onLivePreviewChange: () => () => {},
  }
})
vi.mock('../livePreviewCopies', async importOriginal => ({
  ...(await importOriginal<typeof import('../livePreviewCopies')>()),
  copyPlaceOf: (lp: { id: string }) => copies.get(lp.id)!,
  removeOwnCopy: async () => {},
}))
vi.mock('../../hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: () => {}, onOpen: () => {}, connectionState: () => 'connected' },
}))

const { LivePreviewGuard } = await import('../guard/guard')
const { guardDeps, recoverAfterRestart } = await import('../livePreviewService')
const { installGuard } = await import('../livePreviewRuntime')
const { startContainers } = await import('../livePreviewLife')
const { containerDifferences, forgetMadeForTests, stopContainers, leftovers } = await import('../container/container')

const STAMP = Date.now().toString(36)
const IDS = [`ra${STAMP}`, `rb${STAMP}`]
const acted: string[] = []

function row(id: string): LivePreviewRow {
  return {
    id, projectId: 'pr1', personId: 'p1', ownerType: 'project', ownerId: 'pr1', workspaceId: 'w1', branch: `b-${id}`, onMain: false,
    copyKind: 'branch', copyId: `c-${id}`, baseCommit: null, headCommit: null, openedAt: new Date().toISOString(),
    state: { state: 'starting', since: new Date().toISOString() }, runs: [], pending: null, containersRemoved: false,
  } as LivePreviewRow
}

function testGuard(): InstanceType<typeof LivePreviewGuard> {
  const real = guardDeps()
  return new LivePreviewGuard({
    ...real,
    // The machine's firewall rules are the host service's tests'; here nothing reports drops or a problem.
    drops: async () => null,
    protectionsProblem: async () => null,
    report: () => {},
    hqLineUp: () => true,
    actions: {
      ...real.actions,
      pause: async (id, detail, signal) => { acted.push(`pause ${id} ${signal}: ${detail}`); return real.actions.pause(id, detail, signal) },
      stop: async (id, detail, signal) => { acted.push(`stop ${id} ${signal}: ${detail}`); return real.actions.stop(id, detail, signal) },
      tell: () => {},
    },
  })
}

const stateOf = (id: string) => (rows.get(id) as LivePreviewRow | undefined)?.state

async function until(check: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (check()) return true
    await new Promise(r => setTimeout(r, 250))
  }
  return check()
}

describe.skipIf(!ready)('two live previews and a site restart @SC-1739', () => {
  let guard: InstanceType<typeof LivePreviewGuard>

  beforeAll(async () => {
    process.env.AGENT_IMAGE = image
    for (const id of IDS) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-restart-'))
      fs.writeFileSync(path.join(dir, 'index.html'), `${id}\n`)
      copies.set(id, { hostDir: fs.realpathSync(dir), containerDir: `/projects/pr1/clones/c-${id}` })
      rows.set(id, row(id))
    }
    guard = testGuard()
    installGuard(guard)
    guard.start()
    for (const id of IDS) {
      await startContainers(rows.get(id) as LivePreviewRow)
      rows.set(id, { ...(rows.get(id) as LivePreviewRow), state: { state: 'running', since: new Date().toISOString() } })
    }
  })

  afterAll(async () => {
    guard?.stop()
    for (const id of IDS) await stopContainers(id).catch(() => {})
    for (const c of copies.values()) fs.rmSync(c.hostDir, { recursive: true, force: true })
  })

  it('runs both before the restart', async () => {
    for (const id of IDS) expect(await containerDifferences(id)).toEqual([])
  })

  it('brings both back after the restart, each with a fresh container as its template says, and stops neither', async () => {
    guard.stop()
    forgetMadeForTests()
    guard = testGuard()
    installGuard(guard)
    expect(await recoverAfterRestart(guard)).toBe(2)
    for (const id of IDS) {
      expect(stateOf(id)).toMatchObject({ state: 'paused', reason: 'lineLost' })
      expect(await leftovers(id)).toEqual([])
    }

    guard.start()
    const back = await until(() => IDS.every(id => stateOf(id)?.state === 'running'), 120_000)
    expect({ back, states: IDS.map(stateOf), acted }).toMatchObject({ back: true, acted: [] })
    for (const id of IDS) {
      expect(await containerDifferences(id)).toEqual([])
      expect((rows.get(id) as LivePreviewRow).containersRemoved).toBe(false)
    }
    expect(guard.watching().sort()).toEqual([...IDS].sort())
  })

  it('leaves nothing behind when both stop', async () => {
    guard.stop()
    for (const id of IDS) {
      await stopContainers(id)
      expect(await leftovers(id)).toEqual([])
    }
  })
})
