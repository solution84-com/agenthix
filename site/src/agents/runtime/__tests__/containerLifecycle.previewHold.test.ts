import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('../credentialFile', () => import('./fakeCredentialFile'))
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    // openCodeConfigMounts.ts checks each mount point's parts before creating them.
    lstat: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    access: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  },
}))
vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))
vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn() },
}))

/**
 * The container hold — the one part of the preview work that touches the run
 * path, which is why it has a file of its own rather than a case inside the
 * lifecycle suite. A preview is not a run: it holds no concurrency slot. But
 * it IS work somebody is watching, and a sweep that took the container out
 * from under it would end that work with nothing to show for it.
 */
import { AgentContainerManager } from '../AgentContainerManager'
import { onContainerDestroyed, _resetSubscribers } from '../containerDestroyed'
const { execFile } = await import('node:child_process')
const mockExecFile = vi.mocked(execFile)

const NAME = 'agenthix-agent-project-proj-alpha-project-rw'
const AN_HOUR = 3_600_000

/**
 * All three removal paths list containers with `docker ps` — the two sweeps by
 * the boundary label, `stopAgent` by the agent label — so all three are wired
 * to the same names here. Everything else succeeds silently.
 */
function mockDockerListing(names: string) {
  mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
    if (args.includes('label=agenthix.owner')) cb(null, names, '')
    // stopAgent's format is `{{.Names}}` alone — no agent column — so it gets
    // the bare names rather than the sweeps' two-column listing.
    else if (args.some((a: string) => a.startsWith('label=agenthix.agent='))) {
      cb(null, names.split('\n').map(l => l.split('\t')[0]).filter(Boolean).join('\n'), '')
    }
    else if (args.some((a: string) => a.startsWith('name=^'))) cb(null, '', '')
    else cb(null, '', '')
  }) as any)
}

const removals = () => mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')
/** Let an already-resolved promise chain finish. Deterministic, and it does not
 *  touch the fake clock these tests move by hand. */
const drainMicrotasks = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const verbs = () => mockExecFile.mock.calls.map(c => (c[1] as string[])[0])

describe('a container a preview is serving out of', () => {
  let manager: AgentContainerManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    process.env.HOST_NAMESPACE = 'agenthix'
    manager = new AgentContainerManager()
    mockDockerListing(`${NAME}\tcoder\n`)
  })

  afterEach(() => { vi.useRealTimers(); _resetSubscribers() })

  it('is not swept, however idle its runs are', async () => {
    manager.markPreviewStart(NAME)
    vi.setSystemTime(Date.now() + AN_HOUR)

    await manager.sweepIdle(60_000)

    expect(removals()).toHaveLength(0)
  })

  it('is swept once the last preview ends', async () => {
    manager.markPreviewStart(NAME)
    manager.markPreviewEnd(NAME)
    vi.setSystemTime(Date.now() + AN_HOUR)

    await manager.sweepIdle(60_000)

    expect(removals()).toHaveLength(1)
  })

  it('stays up while one of two previews ends', async () => {
    manager.markPreviewStart(NAME)
    manager.markPreviewStart(NAME)
    manager.markPreviewEnd(NAME)
    vi.setSystemTime(Date.now() + AN_HOUR)

    await manager.sweepIdle(60_000)

    expect(removals()).toHaveLength(0)
  })

  it('keeps the container warm: starting a preview counts as activity', async () => {
    vi.setSystemTime(Date.now() + AN_HOUR)
    manager.markPreviewStart(NAME)
    manager.markPreviewEnd(NAME)

    await manager.sweepIdle(60_000)

    // The hold is gone, but the touch is recent — the grace floor, not the
    // preview count, is what keeps it now.
    expect(removals()).toHaveLength(0)
  })

  it('is not taken by the orphan sweep either, when its boundary is not in the live set', async () => {
    manager.markPreviewStart(NAME)

    const removed = await manager.removeOrphans(new Set<string>())

    expect(removed).toBe(0)
    expect(removals()).toHaveLength(0)
  })

  it('is not taken by stopAgent either — stopping an agent is no reason to end a preview', async () => {
    manager.markPreviewStart(NAME)

    const { allRemoved } = await manager.stopAgent('coder')

    expect(removals()).toHaveLength(0)
    // Reported, not silently skipped, exactly as a live run already is.
    expect(allRemoved).toBe(false)
  })

  it('IS taken by stopAgent once the preview has ended', async () => {
    manager.markPreviewStart(NAME)
    manager.markPreviewEnd(NAME)

    const { allRemoved } = await manager.stopAgent('coder')

    expect(removals()).toHaveLength(1)
    expect(allRemoved).toBe(true)
  })
})

describe('the end of a run in a container a preview is serving out of', () => {
  let manager: AgentContainerManager

  const execs = () => mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'exec')

  beforeEach(() => {
    vi.clearAllMocks()
    _resetSubscribers()
    process.env.HOST_NAMESPACE = 'agenthix'
    manager = new AgentContainerManager()
    mockDockerListing(`${NAME}\tcoder\n`)
  })

  afterEach(() => { _resetSubscribers() })

  // adr-0083: nothing is reset when a turn ends, so a dev server somebody is
  // watching outlives the run that started it and every run after it.
  it('runs nothing in the container when the run ends or the preview ends', async () => {
    manager.markRunStart(NAME)
    manager.markPreviewStart(NAME)
    manager.markRunEnd(NAME)
    manager.markPreviewEnd(NAME)
    await drainMicrotasks()

    expect(execs()).toHaveLength(0)
    expect(removals()).toHaveLength(0)
  })
})

describe('a hold when the container underneath it is destroyed', () => {
  let manager: AgentContainerManager

  beforeEach(() => {
    vi.clearAllMocks()
    _resetSubscribers()
    process.env.HOST_NAMESPACE = 'agenthix'
    manager = new AgentContainerManager()
    mockDockerListing(`${NAME}\tcoder\n`)
  })

  afterEach(() => { _resetSubscribers() })

  it('does not survive a recreate, so the new container is not held by a preview that died', async () => {
    // Two holds, one of which is never released — a preview whose container is
    // destroyed under it can release nothing, because there is nothing left to
    // release it from.
    manager.markPreviewStart(NAME)
    manager.markPreviewStart(NAME)
    manager.markPreviewEnd(NAME)

    // `ensureRunning` force-removes a container whose mount signature changed
    // and starts a new one under the same name. `getOrCreateState` reuses the
    // state object, so a hold left on it would be inherited by a container
    // that holds nothing.
    await manager.ensureRunning(
      { scope: 'storage', ownerType: 'project', ownerId: 'proj-alpha', mode: 'rw', runner: { kind: 'project', projectId: 'proj-alpha' } },
      { handle: 'coder', runtime: 'opencode', sessionId: 's1', credential: null },
      { boundary: { hostDir: '/site/projects/proj-alpha', containerDir: '/projects/proj-alpha' }, folders: [], locationMode: 'rw' },
    )

    // `_start` force-removes before it recreates, so the recreate's own `rm`
    // has to be out of the count before the sweep is asked anything.
    expect(verbs()).toContain('run')
    mockExecFile.mockClear()
    mockDockerListing(`${NAME}\tcoder\n`)

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + AN_HOUR)
    await manager.sweepIdle(60_000)
    vi.useRealTimers()

    // Nothing but a site restart would clear a leaked hold: `sweepGone` drops
    // entries whose container is GONE, and the leak is what keeps this one up.
    expect(removals()).toHaveLength(1)
  })

  it('tells whoever is listening, so records of what was inside it can be dropped', async () => {
    const told: string[] = []
    onContainerDestroyed(name => told.push(name))

    await manager.stopAgent('coder')

    expect(told).toEqual([NAME])
  })
})
