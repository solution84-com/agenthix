import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    // openCodeConfigMounts.ts checks each mount point's parts before creating them.
    lstat: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    access: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    // A run granted no subscription takes the previous run's document away.
    rm: vi.fn().mockResolvedValue(undefined),
    // SC-349: agentCredentials.ts reads (not just probes) the credential
    // files now, to compare expiresAt. Defaults to ENOENT for every path —
    // both seed and agent copy read as epoch 0, which reproduces the OLD
    // default ("already seeded, don't overwrite") for every test below that
    // doesn't care about credential freshness.
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  },
}))

vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

// SC-349: agentCredentials.ts now sends a site.credentialHealth event through
// the live hq channel on a dead grant — mocked at the module boundary
// (matching how AgentEngine's own tests mock SiteStreamEmitter) rather than
// pulling hqConnection.ts's real transitive chain (ws, the Prisma client, the
// channel registry) into a container-lifecycle test file.
vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn() },
}))

// Split out of AgentContainerManager.test.ts in phase 5d-2 — the file this half
// came from grew past the repo's 500-line source convention. Covers
// `removeOrphans` and `sweepIdle`, delegated by AgentContainerManager to the
// ContainerLifecycle class (containerLifecycle.ts) it composes — imported here
// via the SAME `AgentContainerManager` entry point the pre-split file used, so
// these tests exercise the exact public API a caller (setup.ts) sees, not the
// lifecycle class in isolation.
import { AgentContainerManager } from '../AgentContainerManager'
import { clearContainerSiteIdForTests, setContainerSiteId } from '../containerLabels'
import type { AgentMounts, ContainerKey, ContainerContext } from '../containerTypes'
const { execFile } = await import('node:child_process')
const mockExecFile = vi.mocked(execFile)
import fs from 'node:fs/promises'
const mockFs = vi.mocked(fs)

const IMAGE = 'agenthix-agent'
const SITE_ROOT = '/site'
const EMPTY_MOUNTS: AgentMounts = { boundary: { hostDir: '/site/projects/proj-alpha', containerDir: '/projects/proj-alpha' }, folders: [], locationMode: 'rw' }
const SESSION_ID = 'sess-1'

// ADR-0057: both sweeps key on the storage location the container is bound to,
// never on the agent that happened to start it.
const ALPHA_RW: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-alpha', mode: 'rw', runner: { kind: 'project', projectId: 'proj-alpha' } }
const ALPHA_RW_NAME = 'agenthix-agent-project-proj-alpha-project-rw'
const NO_CTX: ContainerContext = { handle: 'coder', runtime: 'claude-sdk', sessionId: SESSION_ID, credential: null }

/**
 * Simulates a container that doesn't exist yet: `inspect` fails (not found),
 * `exec` (credential check) succeeds, and `rm`/`run` succeed. For tests whose
 * focus is the `docker run` argv, not the running/not-running state machine.
 */
function mockDockerFirstStart() {
  mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
    if (args?.[0] === 'inspect') cb(new Error('No such container'), '', '')
    else if (args?.[0] === 'exec') cb(null, '', '')
    else cb(null, '', '')  // rm / run
  }) as any)
}

/**
 * Wires removeOrphans' two `docker ps` listings (label-based, then prefix-based
 * fallback) to the given raw stdout, and optionally makes `rm` fail. Collapses
 * the branch-dispatch boilerplate repeated across the removeOrphans tests below.
 */
function mockDockerRemoveOrphans(opts: { labeled?: string; prefixed?: string; rmFails?: boolean }) {
  mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
    if (args.includes('label=agenthix.owner')) cb(null, opts.labeled ?? '', '')
    else if (args.some((a: string) => a.startsWith('name=^'))) cb(null, opts.prefixed ?? '', '')
    else if (args[0] === 'rm' && opts.rmFails) cb(new Error('container is busy'), '', '')
    else cb(null, '', '')
  }) as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AGENT_CONTAINER_ISOLATION = IMAGE
  process.env.SITE_ROOT = SITE_ROOT
  process.env.HOST_NAMESPACE = 'agenthix'
  // Every container knob one test or another sets. Kept identical to
  // AgentContainerManager.test.ts's own block: two copies that drift leave a
  // value set for whichever file runs next.
  delete process.env.AGENT_CONTAINER_MEMORY
  delete process.env.AGENT_CONTAINER_PIDS_LIMIT
  delete process.env.AGENT_CONTAINER_CPUS
  delete process.env.AGENT_CONTAINER_ENDRUN_SECONDS
  // Default (NO_CTX.credential === null): no API key — credential check runs (OAuth flow)
  mockFs.access.mockResolvedValue(undefined)
  // clearAllMocks() clears call history but not a factory's mockRejectedValue —
  // still, re-assert explicitly (matches the mockFs.access line above) so this
  // doesn't depend on that Vitest behavior surviving a version bump.
  mockFs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
})

afterEach(() => {
  vi.useRealTimers()
})

/** Wires sweepIdle's `docker ps` listing to the given running container names, and `rm` to succeed. */
function mockDockerSweep(names: string[], opts: { rmFails?: boolean } = {}) {
  mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
    if (args[0] === 'ps') cb(null, names.length ? names.join('\n') + '\n' : '', '')
    else if (args[0] === 'rm' && opts.rmFails) cb(new Error('container is busy'), '', '')
    else cb(null, '', '')
  }) as any)
}

describe('removeOrphans @SC-325', () => {
  it('gives up on a docker that never answers instead of holding the boot', async () => {
    vi.useFakeTimers()
    mockExecFile.mockImplementation((() => { /* never calls back: a wedged daemon */ }) as any)
    const mgr = new AgentContainerManager()

    const removed = mgr.removeOrphans(new Set(['project:proj-alpha']))
    await vi.advanceTimersByTimeAsync(120_000)

    await expect(removed).resolves.toBe(0)
  })

  it("label branch's ps call is filtered by BOTH agenthix.owner and this install's compose project", async () => {
    const mgr = new AgentContainerManager()
    mockDockerRemoveOrphans({})

    await mgr.removeOrphans(new Set(['project:proj-alpha']))

    // Pinned with toEqual: dropping either filter (e.g. losing the project scope
    // while refactoring) must fail this test even though every other removeOrphans
    // test stays green, since none of them assert the exact ps argv.
    expect(mockExecFile.mock.calls[0][1]).toEqual([
      'ps', '-a',
      '--filter', 'label=agenthix.owner',
      '--filter', 'label=com.docker.compose.project=agenthix-agents',
      '--format', '{{.Names}}\t{{.Label "agenthix.owner"}}',
    ])
  })

  it('sweeps by the boundary key: a container whose owner is not in activeBoundaries is removed', async () => {
    const mgr = new AgentContainerManager()
    mockDockerRemoveOrphans({
      labeled:
        'agenthix-agent-project-proj-alpha-rw\tproject:proj-alpha\n' +
        'agenthix-agent-project-proj-gone-rw\tproject:proj-gone\n',
    })

    const removed = await mgr.removeOrphans(new Set(['project:proj-alpha']))

    expect(removed).toBe(1)
    const rmCall = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'rm')
    expect(rmCall?.[1]).toEqual(['rm', '-f', 'agenthix-agent-project-proj-gone-rw'])
  })

  it('keeps both of a live boundary\'s containers — the key is the owner, not the mode', async () => {
    const mgr = new AgentContainerManager()
    mockDockerRemoveOrphans({
      labeled:
        'agenthix-agent-project-proj-alpha-rw\tproject:proj-alpha\n' +
        'agenthix-agent-project-proj-alpha-ro\tproject:proj-alpha\n',
    })

    const removed = await mgr.removeOrphans(new Set(['project:proj-alpha']))

    expect(removed).toBe(0)
    expect(mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')).toEqual([])
  })

  it('removes a container whose owner label is missing — it cannot be attributed to a live boundary', async () => {
    const mgr = new AgentContainerManager()
    mockDockerRemoveOrphans({ labeled: 'agenthix-agent-project-proj-alpha-rw\t\n' })

    const removed = await mgr.removeOrphans(new Set(['project:proj-alpha']))

    expect(removed).toBe(1)
  })

  it('label branch: a failed rm is not counted as removed, and logs a warning instead', async () => {
    const mgr = new AgentContainerManager()
    mockDockerRemoveOrphans({ labeled: 'agenthix-agent-project-proj-gone-rw\tproject:proj-gone\n', rmFails: true })

    const removed = await mgr.removeOrphans(new Set(['project:proj-alpha']))

    expect(removed).toBe(0)
  })

  it('never removes a container by its name prefix alone: another site on the same Docker may share it', async () => {
    const mgr = new AgentContainerManager()
    // Another site's container, or one from before the labels: it carries this install's name prefix but none of
    // this site's labels, so it is not this site's to remove.
    mockDockerRemoveOrphans({ prefixed: 'agenthix-agent-coder-sess-1\n' })

    const removed = await mgr.removeOrphans(new Set(['project:proj-alpha']))

    expect(removed).toBe(0)
    expect(mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')).toEqual([])
    expect(mockExecFile.mock.calls.some(c => (c[1] as string[]).some(a => a.startsWith('name=')))).toBe(false)
  })

  it("keeps to this site's own containers by its site id label, once the site's id is set", async () => {
    setContainerSiteId('site-a')
    try {
      const mgr = new AgentContainerManager()
      mockDockerRemoveOrphans({})

      await mgr.removeOrphans(new Set(['project:proj-alpha']))

      expect(mockExecFile.mock.calls[0][1]).toEqual([
        'ps', '-a',
        '--filter', 'label=agenthix.owner',
        '--filter', 'label=com.docker.compose.project=agenthix-agents',
        '--filter', 'label=agenthix.site=site-a',
        '--format', '{{.Names}}\t{{.Label "agenthix.owner"}}',
      ])
    } finally {
      clearContainerSiteIdForTests()
    }
  })

  it('returns 0 when no containers exist', async () => {
    const mgr = new AgentContainerManager()
    mockDockerRemoveOrphans({})

    const removed = await mgr.removeOrphans(new Set(['project:proj-alpha']))

    expect(removed).toBe(0)
  })

  it('returns 0 when docker is unavailable', async () => {
    const mgr = new AgentContainerManager()
    mockExecFile.mockImplementationOnce((_cmd, _args, cb: any) => cb(new Error('docker not found'), '', ''))

    const removed = await mgr.removeOrphans(new Set())

    expect(removed).toBe(0)
  })
})

describe('idle teardown @SC-327', () => {
  it('lists this install\'s boundary containers, carrying the agent label for the credential write-back', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const mgr = new AgentContainerManager()
    mockDockerSweep([])

    await mgr.sweepIdle(30 * 60_000)

    expect(mockExecFile.mock.calls[0][1]).toEqual([
      'ps',
      '--filter', 'label=agenthix.owner',
      '--filter', 'label=com.docker.compose.project=agenthix-agents',
      '--format', '{{.Names}}\t{{.Label "agenthix.agent"}}',
    ])
  })

  it('stops a container with no active run past the idle window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()
    const name = await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
    // Exercise the real lifecycle — a run actually started and finished in this
    // container — so markRunEnd's decrement-and-stamp is covered, not just markRunStart.
    mgr.markRunStart(name)
    mgr.markRunEnd(name)

    vi.setSystemTime(31 * 60_000)  // past both the grace floor and the idle window
    mockExecFile.mockClear()  // isolate the sweep phase from ensureRunning's own pre-clean `rm`
    mockDockerSweep([name])
    await mgr.sweepIdle(30 * 60_000)

    const rmCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')
    expect(rmCalls.some(c => (c[1] as string[])[2] === name)).toBe(true)
  })

  it('never stops a container with an active run, however old', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()
    const name = await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
    mgr.markRunStart(name)

    vi.setSystemTime(10 * 60 * 60_000)  // 10 hours later — well past any idle window
    mockExecFile.mockClear()  // isolate the sweep phase from ensureRunning's own pre-clean `rm`
    mockDockerSweep([name])
    await mgr.sweepIdle(30 * 60_000)

    const rmCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')
    expect(rmCalls.some(c => (c[1] as string[])[2] === name)).toBe(false)
  })

  it('never stops a container with an in-flight start', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const mgr = new AgentContainerManager()
    const name = mgr.containerName(ALPHA_RW)
    // 'run' deliberately never calls back — the start stays in-flight (state.starting pending).
    mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
      if (args[0] === 'inspect') cb(new Error('No such container'), '', '')
      else if (args[0] === 'run') { /* never resolves */ }
      else cb(null, '', '')  // rm / exec
    }) as any)

    const ensurePromise = mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
    // Flush microtasks until the in-flight `run` call has actually been issued.
    while (!mockExecFile.mock.calls.some(c => (c[1] as string[])[0] === 'run')) {
      await Promise.resolve()
    }
    ensurePromise.catch(() => {})  // never settles in this test — avoid an unhandled-rejection false alarm

    vi.setSystemTime(10 * 60 * 60_000)
    mockExecFile.mockClear()  // isolate the sweep phase from _start's own pre-clean `rm`
    mockDockerSweep([name])
    await mgr.sweepIdle(30 * 60_000)

    const rmCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')
    expect(rmCalls.some(c => (c[1] as string[])[2] === name)).toBe(false)
  })

  it('adopts unknown running containers with lastActivity = first-seen (no instant teardown after restart)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const mgr = new AgentContainerManager()  // fresh manager — no in-memory state, simulating a server restart
    const name = 'agenthix-agent-project-proj-adopted-rw'
    mockDockerSweep([name])

    await mgr.sweepIdle(30 * 60_000)
    let rmCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')
    expect(rmCalls.length).toBe(0)  // adopted, not torn down instantly

    // One idle window after the adoption (first-seen), it now tears down.
    vi.setSystemTime(1_000_000 + 31 * 60_000)
    await mgr.sweepIdle(30 * 60_000)
    rmCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')
    expect(rmCalls.some(c => (c[1] as string[])[2] === name)).toBe(true)
  })

  it('a just-ensured container is inside the grace floor and is not swept', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()
    const name = await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    vi.setSystemTime(30_000)  // 30s later — inside the 60s grace floor
    mockExecFile.mockClear()  // isolate the sweep phase from ensureRunning's own pre-clean `rm`
    mockDockerSweep([name])
    await mgr.sweepIdle(1)  // idleMs=1ms — would otherwise be swept instantly

    const rmCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')
    expect(rmCalls.some(c => (c[1] as string[])[2] === name)).toBe(false)
  })

  it('teardown prunes the container state entry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const mgr = new AgentContainerManager()
    const name = mgr.containerName(ALPHA_RW)
    let running = false
    mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
      if (args[0] === 'inspect') cb(running ? null : new Error('No such container'), running ? 'true\n' : '', '')
      else if (args[0] === 'run') { running = true; cb(null, '', '') }
      else if (args[0] === 'ps') cb(null, `${name}\n`, '')
      else cb(null, '', '')  // rm / exec — rm deliberately does not flip `running` back, mirroring a raced removal
    }) as any)

    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)  // run #1
    vi.setSystemTime(31 * 60_000)
    await mgr.sweepIdle(30 * 60_000)  // tears down; inspect still reports "running" per the raced-rm mock
    // With the state entry pruned, ensureRunning can't trust the stale mount signature
    // and must restart rather than silently reusing the (still "running") container.
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)  // run #2

    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(runCalls.length).toBe(2)
  })

  it('sweepIdle(NaN) removes nothing — an unparsable idle window fails safe rather than inverting the policy', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()
    const name = await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    vi.setSystemTime(10 * 60 * 60_000)  // well past any real idle window
    mockExecFile.mockClear()
    mockDockerSweep([name])
    await mgr.sweepIdle(NaN)

    // Fails safe before even listing containers — no `ps`, no `rm`.
    expect(mockExecFile.mock.calls.some(c => (c[1] as string[])[0] === 'ps')).toBe(false)
    expect(mockExecFile.mock.calls.some(c => (c[1] as string[])[0] === 'rm')).toBe(false)
  })

  it('a concurrent ensureRunning waits for sweepIdle\'s rm to land, then starts fresh, rather than reusing a container mid-teardown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const mgr = new AgentContainerManager()
    const name = mgr.containerName(ALPHA_RW)

    mockDockerFirstStart()
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    vi.setSystemTime(31 * 60_000)  // past both the grace floor and the idle window
    mockExecFile.mockClear()

    // sweepIdle's `rm` deliberately never calls back until the test resolves it —
    // reproducing the exact interleaving: the removal is decided (state.stopping
    // set) but not yet landed when a concurrent ensureRunning comes in. `inspect`
    // reports the container as still running throughout, since docker only stops
    // reporting it once the (still-pending) `rm -f` actually lands — this is what
    // makes the pre-fix reviewer probe reuse it. Only the FIRST `rm` call (sweepIdle's
    // own) hangs; a second `rm` — `_start`'s own pre-clean call, reached only once
    // ensureRunning has waited for `state.stopping` and moved on to a fresh start —
    // must resolve normally, or the fix's own restart would deadlock on itself.
    let resolveRm!: () => void
    let rmCallCount = 0
    mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
      if (args[0] === 'ps') cb(null, `${name}\n`, '')
      else if (args[0] === 'rm') {
        rmCallCount++
        if (rmCallCount === 1) resolveRm = () => cb(null, '', '')
        else cb(null, '', '')
      }
      else if (args[0] === 'inspect') cb(null, 'true\n', '')
      else cb(null, '', '')  // run / exec
    }) as any)

    const sweepPromise = mgr.sweepIdle(30 * 60_000)
    // Flush microtasks until sweepIdle's `rm` has actually been issued (state.stopping is now set).
    while (!resolveRm) {
      await Promise.resolve()
    }

    // Reviewer probe (without the fix): ensureRunning's pre-await _isRunning/mountSig
    // check would see the container as still running with a matching signature and
    // REUSE it, returning before the rm lands — "runs issued: 1 | container running
    // after sweep: false". With the fix, it must wait for `stopping` and start fresh.
    const ensurePromise = mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    resolveRm()
    await sweepPromise
    const resultName = await ensurePromise

    expect(resultName).toBe(name)
    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(runCalls.length).toBe(1)  // one FRESH `docker run`, issued only after the rm landed
  })
})

/**
 * A container is named for its storage boundary, and two agents working in one
 * project share that boundary. Nothing mounted into it may vary by agent, or
 * the second agent's run fails the signature comparison, recreates the
 * container, waits for the first run to drain, and refuses when it does not
 * finish inside the drain window — which makes a project with several agents
 * unusable. This is the pin for that, at the level the failure actually
 * appeared: two `ensureRunning` calls that differ only in the agent.
 */
describe('a boundary\'s container serves every agent that works in it', () => {
  const isRunCall = (c: unknown[]) => (c[1] as string[])[0] === 'run'
  const isRemoveCall = (c: unknown[]) => (c[1] as string[])[0] === 'rm'

  it('two agents in one project share the boundary\'s container rather than recreating it', async () => {
    const mgr = new AgentContainerManager()
    // Real running-state transitions: `inspect` reports not-running until this
    // name's `run` lands, so the second call genuinely reaches the reuse
    // branch rather than being handed a container that was never started.
    const running = new Set<string>()
    mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
      if (args?.[0] === 'inspect') {
        const name = args[args.length - 1]
        cb(running.has(name) ? null : new Error('No such container'), running.has(name) ? 'true\n' : '', '')
      } else if (args?.[0] === 'run') {
        running.add(args[args.indexOf('--name') + 1])
        cb(null, '', '')
      } else cb(null, '', '')  // rm / exec
    }) as any)

    const ctxFor = (handle: string): ContainerContext => ({ ...NO_CTX, handle, sessionId: `sess-${handle}` })

    await mgr.ensureRunning(ALPHA_RW, ctxFor('alpha'), EMPTY_MOUNTS)
    const runsAfterFirst = mockExecFile.mock.calls.filter(isRunCall).length
    const removesAfterFirst = mockExecFile.mock.calls.filter(isRemoveCall).length

    await mgr.ensureRunning(ALPHA_RW, ctxFor('beta'), EMPTY_MOUNTS)

    expect(mockExecFile.mock.calls.filter(isRunCall).length).toBe(runsAfterFirst)      // no second `docker run`
    expect(mockExecFile.mock.calls.filter(isRemoveCall).length).toBe(removesAfterFirst) // and nothing was torn down
  })

  it('still keeps two different boundaries apart', async () => {
    // Positive control for the test above: the reuse it pins is reuse of ONE
    // boundary's container, never a second boundary landing in it.
    const mgr = new AgentContainerManager()
    const running = new Set<string>()
    mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
      if (args?.[0] === 'inspect') {
        const name = args[args.length - 1]
        cb(running.has(name) ? null : new Error('No such container'), running.has(name) ? 'true\n' : '', '')
      } else if (args?.[0] === 'run') {
        running.add(args[args.indexOf('--name') + 1])
        cb(null, '', '')
      } else cb(null, '', '')
    }) as any)

    const BETA_RW: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-beta', mode: 'rw', runner: { kind: 'project', projectId: 'proj-beta' } }
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
    await mgr.ensureRunning(BETA_RW, NO_CTX, EMPTY_MOUNTS)

    const names = mockExecFile.mock.calls
      .filter(isRunCall)
      .map(c => { const a = c[1] as string[]; return a[a.indexOf('--name') + 1] })
    expect(names).toEqual([ALPHA_RW_NAME, 'agenthix-agent-project-proj-beta-project-rw'])
  })
})
