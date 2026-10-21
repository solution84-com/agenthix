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
    // boundaryClaudeHome.ts writes the run's credential through a temp file
    // and an atomic rename rather than straight onto the destination.
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    // A run granted no subscription takes the previous run's document away.
    rm: vi.fn().mockResolvedValue(undefined),
    // The credential files are READ (not just probed), to compare expiresAt.
    // Defaults to ENOENT for every path — an empty home and an unexpired
    // check, which is what every test below that doesn't care about
    // credentials wants.
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

// Severed from hq's version in phase 5d-2: the LLM API key used to come
// from providerService.getLlmApiKey (hq's own Provider table, fetched
// internally) — now it's ContainerContext.credential, passed straight in by the
// caller (pre-resolved by hq at dispatch). Tests below set it directly on the
// ctx object instead of mocking a fetch.
import { AgentContainerManager } from '../AgentContainerManager'
import type { AgentMounts, ContainerKey, ContainerContext } from '../containerTypes'
const { execFile } = await import('node:child_process')
const mockExecFile = vi.mocked(execFile)
import fs from 'node:fs/promises'
const mockFs = vi.mocked(fs)
/** writeFile calls that write a credential — not the one-time `~/.claude.json` seed (prepareHarnessHome) nor OpenCode's configuration `.gitignore` (openCodeConfigMounts). */
const credentialWrites = () => mockFs.writeFile.mock.calls.filter(c => !/\/(\.claude\.json|\.gitignore)$/.test(String(c[0])))

const IMAGE = 'agenthix-agent'
const SITE_ROOT = '/site'
/** The project's own runs' harness home, and the Claude folder inside it. */
const ALPHA_HOME = `${SITE_ROOT}/homes/projects/proj-alpha`
const ALPHA_CLAUDE = `${ALPHA_HOME}/.claude`
const API_KEY = 'sk-test-key'
const EMPTY_MOUNTS: AgentMounts = { boundary: { hostDir: '/site/projects/proj-alpha', containerDir: '/projects/proj-alpha' }, folders: [], locationMode: 'rw' }
const RO_MOUNTS: AgentMounts = { boundary: { hostDir: '/site/projects/proj-alpha', containerDir: '/projects/proj-alpha' }, folders: [], locationMode: 'ro' }

/** What containerPrep hands ensureRunning for a boundary (ADR-0079): its one
 *  folder, bound whole, and the folders inside it the prompt lists. */
function boundaryMounts(root: string, locationMode: 'rw' | 'ro' = 'rw', folders: string[] = ['files']): AgentMounts {
  return {
    boundary: { hostDir: `${SITE_ROOT}/${root}`, containerDir: `/${root}` },
    folders: folders.map(f => ({ hostDir: `${SITE_ROOT}/${root}/${f}`, containerDir: `/${root}/${f}` })),
    locationMode,
  }
}
const SESSION_ID = 'sess-1'

// ADR-0057: the container belongs to a storage location, not to a session. The
// key is (ownerType, ownerId, mode); the agent, the session and the task are
// context and ride as labels only.
const ALPHA_RW: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-alpha', mode: 'rw', runner: { kind: 'project', projectId: 'proj-alpha' } }
const ALPHA_RO: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-alpha', mode: 'ro', runner: { kind: 'project', projectId: 'proj-alpha' } }
const BETA_RW: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-beta', mode: 'rw', runner: { kind: 'project', projectId: 'proj-beta' } }
const ADA_RW: ContainerKey = { scope: 'storage', ownerType: 'user', ownerId: 'user-ada', mode: 'rw', runner: { kind: 'person', userId: 'user-ada' } }

const ALPHA_RW_NAME = 'agenthix-agent-project-proj-alpha-project-rw'
const ALPHA_RO_NAME = 'agenthix-agent-project-proj-alpha-project-ro'
const BETA_RW_NAME = 'agenthix-agent-project-proj-beta-project-rw'
const ADA_RW_NAME = 'agenthix-agent-user-user-ada-rw'

const NO_CTX: ContainerContext = { handle: 'coder', runtime: 'claude-sdk', sessionId: SESSION_ID, credential: null }

/** A ContainerContext for the same agent, in another session of the same boundary. */
function ctx(overrides: Partial<ContainerContext> = {}): ContainerContext {
  return { ...NO_CTX, ...overrides }
}

/** execFile's callback is the third argument, or the fourth when an options object precedes it (a `docker run` carrying the model API key in its environment). */
function callbackOf(a3: any, a4?: any): (err: Error | null, stdout: string, stderr: string) => void {
  return typeof a3 === 'function' ? a3 : a4
}

/**
 * Simulates a container that doesn't exist yet: `inspect` fails (not found),
 * `exec` (credential check) succeeds, and `rm`/`run` succeed. For tests whose
 * focus is the `docker run` argv, not the running/not-running state machine.
 */
function mockDockerFirstStart() {
  mockExecFile.mockImplementation(((_cmd: any, args: any, a3: any, a4?: any) => {
    const cb = callbackOf(a3, a4)
    if (args?.[0] === 'inspect') cb(new Error('No such container'), '', '')
    else if (args?.[0] === 'exec') cb(null, '', '')
    else cb(null, '', '')  // rm / run
  }) as any)
}

/**
 * Simulates real running-state transitions, per container name: `inspect`
 * reports not-running until that name's `run` call flips it to running (`rm`
 * does NOT flip it back — that mirrors a raced or failed removal, which the
 * mount-signature pruning test below relies on). For tests exercising the
 * reuse-vs-restart decision, and for tests where two boundaries are live at
 * once and must not be confused for one another.
 */
function mockDockerWithRunningToggle() {
  const running = new Set<string>()
  mockExecFile.mockImplementation(((_cmd: any, args: any, a3: any, a4?: any) => {
    const cb = callbackOf(a3, a4)
    if (args?.[0] === 'inspect') {
      const name = args[args.length - 1]
      cb(running.has(name) ? null : new Error('No such container'), running.has(name) ? 'true\n' : '', '')
    } else if (args?.[0] === 'run') {
      running.add(args[args.indexOf('--name') + 1])
      cb(null, '', '')
    } else cb(null, '', '')  // rm / exec
  }) as any)
}

/** Queues one `mockImplementationOnce` per entry — for tests asserting exact per-call argv/order. */
function mockDockerSequence(...responses: Array<{ err?: any; stdout?: string }>) {
  for (const { err, stdout } of responses) {
    mockExecFile.mockImplementationOnce(((_cmd: any, _args: any, a3: any, a4?: any) => callbackOf(a3, a4)(err ?? null, stdout ?? '', '')) as any)
  }
}

/** The docker subcommands issued, in order — so a test can assert what a change of
 *  owner or mount set actually did (destroy + create, never a live remount). */
function subcommands(): string[] {
  return mockExecFile.mock.calls.map(c => (c[1] as string[])[0])
}

function runArgvFor(name: string): string[] | undefined {
  const call = mockExecFile.mock.calls.find(c => {
    const args = c[1] as string[]
    return args[0] === 'run' && args.includes(name)
  })
  return call?.[1] as string[] | undefined
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AGENT_CONTAINER_ISOLATION = IMAGE
  process.env.SITE_ROOT = SITE_ROOT
  process.env.HOST_NAMESPACE = 'agenthix'
  // Every container knob one test or another sets. Kept identical to
  // containerLifecycle.test.ts's own block: two copies that drift leave a value
  // set for whichever file runs next.
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

describe('AgentContainerManager @SC-121', () => {
  it('containerName returns predictable name', () => {
    const mgr = new AgentContainerManager()
    expect(mgr.containerName(ALPHA_RW)).toBe(ALPHA_RW_NAME)
  })

  it('ensureRunning starts container when not running', async () => {
    const mgr = new AgentContainerManager()
    // Call 1: inspect (not found) · 2: rm -f cleanup · 3: network inspect (ADR-0066,
    // already exists — no network create) · 4: run · 5: exec credential check
    mockDockerSequence({ err: new Error('No such container') }, {}, {}, {}, {})

    const name = await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    expect(name).toBe(ALPHA_RW_NAME)
    expect(mockExecFile).toHaveBeenCalledTimes(5)
    expect(mockExecFile.mock.calls[0][1]).toEqual(
      ['inspect', '--format', '{{.State.Running}}', ALPHA_RW_NAME]
    )
    expect(mockExecFile.mock.calls[1][1]).toEqual(['rm', '-f', ALPHA_RW_NAME])
    expect(mockExecFile.mock.calls[2][1]).toEqual(['network', 'inspect', `${ALPHA_RW_NAME}-net`])
    const runArgs = mockExecFile.mock.calls[3][1] as string[]
    expect(runArgs).toContain('run')
    expect(runArgs).toContain('-d')
    expect(runArgs).toContain(ALPHA_RW_NAME)
    expect(runArgs).toContain(`${ALPHA_HOME}:/home/appuser`)
    // Must NOT contain /cwd mount — no fixed /cwd bind
    expect(runArgs.join(' ')).not.toContain(':/cwd')
    expect(runArgs).toContain(IMAGE)
    // Must NOT contain database URL or other secrets
    expect(runArgs.join(' ')).not.toContain('DATABASE_URL')
    // No owner-root mounts — mounts are at files/ or workspaces/ level
    expect(runArgs.join(' ')).not.toContain('/wiki:/wiki')
    // No platform-asset or shared-org mounts: that content arrives as packages (spec §6.5)
    expect(runArgs.join(' ')).not.toContain(':/assets')
    expect(runArgs.join(' ')).not.toContain(':/shared')
    expect(mockExecFile.mock.calls[4][1]).toEqual(
      ['exec', ALPHA_RW_NAME, 'test', '-f', '/home/appuser/.claude/.credentials.json']
    )
  })

  it('ensureRunning reuses a running container when the mount set is unchanged', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    // First call starts the container (records the mount sig), second with the same
    // mounts reuses it — no second `run`.
    const mounts: AgentMounts = boundaryMounts('projects/proj-alpha')
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, mounts)
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, mounts)

    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(runCalls.length).toBe(1)
  })

  it('a workspace added to the boundary does not restart its container (ADR-0079)', async () => {
    // The folders the prompt lists change when a workspace is created; the one
    // bind does not, so the container keeps running and the new workspace is
    // simply a new directory inside it.
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    await mgr.ensureRunning(ALPHA_RW, NO_CTX, boundaryMounts('projects/proj-alpha', 'rw', ['files']))
    await mgr.ensureRunning(ALPHA_RW, ctx({ sessionId: 'sess-2' }), boundaryMounts('projects/proj-alpha', 'rw', ['files', 'workspaces/ws-new']))

    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(runCalls.length).toBe(1)
  })

  it('ensureRunning deduplicates concurrent starts for same container name', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    const [r1, r2] = await Promise.all([
      mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS),
      mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS),
    ])

    expect(r1).toBe(ALPHA_RW_NAME)
    expect(r2).toBe(ALPHA_RW_NAME)
    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(runCalls.length).toBe(1)
  })

  it('ensureRunning throws when credentials are missing from container', async () => {
    const mgr = new AgentContainerManager()
    // exec test -f — file not found (exit code 1)
    mockDockerSequence({ err: new Error('No such container') }, {}, {}, {}, { err: Object.assign(new Error('exit code 1'), { code: 1 }) })

    await expect(
      mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
    ).rejects.toThrow(/OAuth credentials not found/)
  })

  it('ensureRunning skips credential check when LLM API key is configured', async () => {
    const mgr = new AgentContainerManager()
    // No call 5 — credential check should be skipped
    mockDockerSequence({ err: new Error('No such container') }, {}, {}, {})

    const name = await mgr.ensureRunning(ALPHA_RW, ctx({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: API_KEY } }), EMPTY_MOUNTS)
    expect(name).toBe(ALPHA_RW_NAME)
    expect(mockExecFile).toHaveBeenCalledTimes(4)  // inspect + rm + network inspect + run, no credential check
    const runArgs = mockExecFile.mock.calls[3][1] as string[]
    expect(runArgs).not.toContain('ANTHROPIC_API_KEY')
  })

  // R-050: the skills staged for a run sit under the Claude home, which the
  // container binds read-write. A read-only bind laid over the staging folder
  // makes it unwritable from inside while the site, on the host, still writes
  // it. (Bits set on the files would not do it: the container's user is the
  // same uid as the site's, and can set them back.)
  it("binds the skills staging folder read-only over the boundary's read-write home", async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    const argv = runArgvFor(ALPHA_RW_NAME) ?? []
    expect(argv).toContain(`${ALPHA_HOME}:/home/appuser`)
    expect(argv).toContain(`${ALPHA_CLAUDE}/.tmp:/home/appuser/.claude/.tmp:ro`)
    // The source exists before docker sees it, or docker creates it root-owned
    // and the site cannot stage into it.
    expect(mockFs.mkdir).toHaveBeenCalledWith(`${ALPHA_CLAUDE}/.tmp`, { recursive: true })
  })

  it("writes the run's own subscription document into the boundary's home before starting", async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()
    const oauthJson = JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() + 60 * 60_000 } })

    await mgr.ensureRunning(ALPHA_RW, ctx({ credential: { kind: 'subscription', provider: 'anthropic', oauthJson, grantId: 'grant-1', loginId: 'login-1' } }), EMPTY_MOUNTS)

    const home = ALPHA_CLAUDE
    expect(mockFs.mkdir).toHaveBeenCalledWith(home, { recursive: true })
    // Written to a temp file in the SAME directory as the destination, then
    // renamed onto it — never straight onto the file the container reads.
    expect(credentialWrites()).toHaveLength(1)
    const [tmpDest, contents] = credentialWrites()[0] as unknown as [string, string]
    expect(contents).toBe(oauthJson)
    expect(tmpDest.startsWith(`${home}/`)).toBe(true)
    expect(mockFs.rename).toHaveBeenCalledWith(tmpDest, `${home}/.credentials.json`)
  })

  it('writes the credential on a REUSED container too, not only when one is started', async () => {
    // The home outlives the run, and the next run in this boundary may carry a
    // different credential — a subscription run arriving at a container an
    // API-key run created would otherwise find no OAuth document at all.
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()
    const oauthJson = JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() + 60 * 60_000 } })

    await mgr.ensureRunning(ALPHA_RW, ctx({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: API_KEY } }), EMPTY_MOUNTS)
    expect(credentialWrites()).toHaveLength(0)

    await mgr.ensureRunning(
      ALPHA_RW,
      ctx({ sessionId: 'sess-2', credential: { kind: 'subscription', provider: 'anthropic', oauthJson, grantId: 'grant-1', loginId: 'login-1' } }),
      EMPTY_MOUNTS,
    )

    expect(credentialWrites()).toHaveLength(1)
    // And it really was the same container — this is a reuse, not a restart.
    expect(mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run').length).toBe(1)
  })

  it('does not overwrite a token the container refreshed in place — freshest wins', async () => {
    // The home's own copy is strictly fresher than the document hq dispatched
    // (both still valid) — it must survive, or the refresh is thrown away
    // before it can be reported back to hq.
    mockFs.readFile.mockImplementation((async (filePath: string) => {
      if (filePath === `${ALPHA_CLAUDE}/.credentials.json`) {
        return JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() + 60 * 60_000 } })
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }) as any)
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, ctx({
      credential: { kind: 'subscription', provider: 'anthropic', oauthJson: JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() + 30 * 60_000 } }), grantId: 'grant-1', loginId: 'login-1' },
    }), EMPTY_MOUNTS)

    expect(credentialWrites()).toHaveLength(0)
  })

  it("binds the boundary's folder once, at the same id path, and no folder inside it on its own", async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, NO_CTX, boundaryMounts('projects/proj-alpha', 'rw', ['files', 'knowledge', 'workspaces/ws-1', 'tasks']))

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    const storageBinds = runArgs.filter((a, i) => runArgs[i - 1] === '-v' && a.startsWith(`${SITE_ROOT}/projects/`))
    expect(storageBinds).toEqual([`${SITE_ROOT}/projects/proj-alpha:/projects/proj-alpha:rw`])
    expect(runArgs.join(' ')).not.toContain(':/cwd')
  })

  it("binds a person's own storage whole, at its id path", async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ADA_RW, NO_CTX, boundaryMounts('users/user-ada', 'rw', ['files', 'workspaces/ws-9']))

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs).toContain(`${SITE_ROOT}/users/user-ada:/users/user-ada:rw`)
    expect(runArgs.join(' ')).not.toContain('/users/user-ada/workspaces/ws-9:')
  })
})

// ── ADR-0057: the container belongs to one storage location ──────────────────

describe('a container is bound to one storage location @SC-325', () => {
  it('two sessions of one person in one project share a container', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    const first = await mgr.ensureRunning(
      ALPHA_RW, ctx({ sessionId: 'sess-a', invokerUserId: 'user-ada' }),
      EMPTY_MOUNTS,
    )
    const second = await mgr.ensureRunning(
      ALPHA_RW, ctx({ sessionId: 'sess-b', invokerUserId: 'user-ada' }),
      EMPTY_MOUNTS,
    )

    expect(first).toBe(ALPHA_RW_NAME)
    expect(second).toBe(ALPHA_RW_NAME)
    // One container, started once — the second session joined it rather than
    // getting a second container with identical protection.
    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(runCalls.length).toBe(1)
  })

  it('a run for another owner gets a different container', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    const alphaMounts: AgentMounts = boundaryMounts('projects/proj-alpha')
    const betaMounts: AgentMounts = boundaryMounts('projects/proj-beta')

    const alpha = await mgr.ensureRunning(ALPHA_RW, NO_CTX, alphaMounts)
    const beta = await mgr.ensureRunning(BETA_RW, NO_CTX, betaMounts)
    const ada = await mgr.ensureRunning(ADA_RW, NO_CTX, EMPTY_MOUNTS)

    expect(alpha).toBe(ALPHA_RW_NAME)
    expect(beta).toBe(BETA_RW_NAME)
    expect(ada).toBe(ADA_RW_NAME)
    expect(new Set([alpha, beta, ada]).size).toBe(3)

    // Neither container can reach the other owner's storage.
    expect(runArgvFor(ALPHA_RW_NAME)!.join(' ')).not.toContain('proj-beta')
    expect(runArgvFor(BETA_RW_NAME)!.join(' ')).not.toContain('proj-alpha')
  })

  it('never rebinds a container from one owner to another', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    const alphaMounts: AgentMounts = boundaryMounts('projects/proj-alpha')
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, alphaMounts)
    mockExecFile.mockClear()

    // The same agent, the same session, now working for a different owner.
    const betaMounts: AgentMounts = boundaryMounts('projects/proj-beta')
    const name = await mgr.ensureRunning(BETA_RW, NO_CTX, betaMounts)

    // A second container, created from scratch — alpha's is never handed the new binds.
    expect(name).toBe(BETA_RW_NAME)
    expect(runArgvFor(BETA_RW_NAME)!.join(' ')).not.toContain('proj-alpha')
    expect(mockExecFile.mock.calls.every(c => !(c[1] as string[]).includes(ALPHA_RW_NAME))).toBe(true)
    // Nothing that could remount a live container: only the subcommands this
    // manager has ever issued — 'network' is the ADR-0066 network-ensure check.
    expect(new Set(subcommands())).toEqual(new Set(['inspect', 'rm', 'network', 'run', 'exec']))
  })

  it('holds at most two containers for one boundary, one per mode', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    const names = [
      await mgr.ensureRunning(ALPHA_RW, ctx({ sessionId: 'sess-a' }), EMPTY_MOUNTS),
      await mgr.ensureRunning(ALPHA_RO, ctx({ sessionId: 'sess-b' }), RO_MOUNTS),
      await mgr.ensureRunning(ALPHA_RW, ctx({ sessionId: 'sess-c' }), EMPTY_MOUNTS),
      await mgr.ensureRunning(ALPHA_RO, ctx({ sessionId: 'sess-d' }), RO_MOUNTS),
    ]

    expect(new Set(names)).toEqual(new Set([ALPHA_RW_NAME, ALPHA_RO_NAME]))
    // Four runs, two containers: the mode is in the key because a read-write to
    // read-only flip changes no bind string, so without it the two would share one.
    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(runCalls.length).toBe(2)
  })

  it('keeps the same container across a chat turn and a task run in one project', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    // The mount set is a function of the owner, not of the run — a task run
    // adds no mount of its own, so it cannot churn the boundary's container.
    const ownerSet: AgentMounts = boundaryMounts('projects/proj-alpha', 'rw', ['files', 'knowledge', 'tasks'])

    const chat = await mgr.ensureRunning(
      ALPHA_RW, ctx({ sessionId: 'sess-chat', invokerUserId: 'user-ada' }),
      ownerSet,
    )
    const task = await mgr.ensureRunning(
      ALPHA_RW, ctx({ sessionId: 'sess-task', taskId: 'task-7' }),
      ownerSet,
    )

    expect(chat).toBe(task)
    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(runCalls.length).toBe(1)
  })
})

describe('recreating a container never kills someone else\'s run', () => {
  // Several runs share a runner's container (ADR-0075), so `_start`'s
  // unconditional `rm -f` must never land on one another run is mid-exec in.
  // The binds cannot differ from theirs (ADR-0079), so the only way to reach a
  // recreate with runs counted is a container that LOOKED not-running.
  const mounts: AgentMounts = boundaryMounts('projects/proj-alpha')

  it('a second run joins a live container at once, whatever folders its prompt lists', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    const name = await mgr.ensureRunning(ALPHA_RW, NO_CTX, mounts)
    mgr.markRunStart(name)

    await expect(
      mgr.ensureRunning(ALPHA_RW, ctx({ sessionId: 'sess-other' }), boundaryMounts('projects/proj-alpha', 'rw', ['files', 'workspaces/ws-new'])),
    ).resolves.toBe(name)
    expect(mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run').length).toBe(1)
    expect(mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm').length).toBe(1)  // the first start's own pre-clean
  })

  it('keeps a container with runs in it when one inspect fails, rather than removing it under them', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()
    const name = await mgr.ensureRunning(ALPHA_RW, NO_CTX, mounts)
    mgr.markRunStart(name)

    // The next inspect fails once, as a busy daemon's can; the one after answers.
    const inner = mockExecFile.getMockImplementation()!
    let failedOnce = false
    mockExecFile.mockImplementation(((cmd: string, args: string[], a3: unknown, a4?: unknown) => {
      if (args[0] === 'inspect' && !failedOnce) {
        failedOnce = true
        return callbackOf(a3, a4)(new Error('daemon busy'), '', '')
      }
      return (inner as Function)(cmd, args, a3, a4)
    }) as never)
    mockExecFile.mockClear()

    await expect(mgr.ensureRunning(ALPHA_RW, ctx({ sessionId: 'sess-other' }), mounts)).resolves.toBe(name)
    expect(subcommands().filter(s => s === 'rm')).toEqual([])
    expect(subcommands().filter(s => s === 'run')).toEqual([])
  })

  it('replaces a container that is really gone, without waiting for runs that died with it', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()
    const name = await mgr.ensureRunning(ALPHA_RW, NO_CTX, mounts)
    mgr.markRunStart(name)

    mockExecFile.mockImplementation(((_cmd: string, args: string[], a3: unknown, a4?: unknown) =>
      args[0] === 'inspect'
        ? callbackOf(a3, a4)(new Error('No such container'), '', '')
        : callbackOf(a3, a4)(null, '', '')) as never)
    mockExecFile.mockClear()

    await expect(mgr.ensureRunning(ALPHA_RW, ctx({ sessionId: 'sess-other' }), mounts)).resolves.toBe(name)
    const ordered = subcommands()
    expect(ordered.indexOf('rm')).toBeLessThan(ordered.indexOf('run'))
    expect(ordered.filter(s => s === 'run').length).toBe(1)
  })
})

describe('container labels @SC-326', () => {
  it('puts no agent, session or task in the name', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    const name = await mgr.ensureRunning(
      ALPHA_RW,
      ctx({ handle: 'coder', sessionId: 'sess-secret', invokerUserId: 'user-42', taskId: 'task-7' }),
      EMPTY_MOUNTS,
    )

    expect(name).not.toContain('coder')
    expect(name).not.toContain('sess-secret')
    expect(name).not.toContain('task-7')
    expect(name).not.toContain('user-42')
    // The name is the boundary and nothing else.
    expect(name).toBe(ALPHA_RW_NAME)
  })

  it('still carries session, agent, invoker and task as labels', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(
      ALPHA_RW,
      ctx({ invokerUserId: 'user-42', taskId: 'task-7' }),
      EMPTY_MOUNTS,
    )

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs).toContain('--label')
    expect(runArgs).toContain(`agenthix.session=${SESSION_ID}`)
    expect(runArgs).toContain('agenthix.agent=coder')
    expect(runArgs).toContain('agenthix.invoker=user-42')
    expect(runArgs).toContain('agenthix.task=task-7')
  })

  it('carries the boundary as a label too, so the sweeps never parse it out of a name', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ADA_RW, NO_CTX, EMPTY_MOUNTS)

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs).toContain('agenthix.owner=user:user-ada')
  })

  it('an unattended run has no invoker label', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, ctx({ invokerUserId: null, taskId: null }), EMPTY_MOUNTS)

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs.join(' ')).not.toContain('agenthix.invoker=')
    expect(runArgs.join(' ')).not.toContain('agenthix.task=')
    // Session, agent and owner labels are always present, context-independent
    expect(runArgs).toContain(`agenthix.session=${SESSION_ID}`)
    expect(runArgs).toContain('agenthix.agent=coder')
    expect(runArgs).toContain('agenthix.owner=project:proj-alpha')
  })
})

describe('stopAgent @SC-325', () => {
  it('stopAgent removes every container labeled with the agent, by NAME, scoped to this install\'s compose project', async () => {
    const mgr = new AgentContainerManager()
    mockDockerSequence({ stdout: `${ALPHA_RW_NAME}\n${BETA_RW_NAME}\n` }, {}, {})

    await mgr.stopAgent('coder')

    // HOST_NAMESPACE='agenthix' (beforeEach) → the agents' group is 'agenthix-agents'
    // Names, not ids — so each removed container's state entry can be pruned by name.
    expect(mockExecFile.mock.calls[0][1]).toEqual(
      ['ps', '-a', '--filter', 'label=agenthix.agent=coder', '--filter', 'label=com.docker.compose.project=agenthix-agents', '--format', '{{.Names}}']
    )
    expect(mockExecFile.mock.calls[1][1]).toEqual(['rm', '-f', ALPHA_RW_NAME])
    expect(mockExecFile.mock.calls[2][1]).toEqual(['rm', '-f', BETA_RW_NAME])
  })

  it('stopAgent scopes the filter to a different install when HOST_NAMESPACE differs', async () => {
    process.env.HOST_NAMESPACE = 'agenthix-local'
    const mgr = new AgentContainerManager()
    mockExecFile.mockImplementationOnce((_cmd, _args, cb: any) => cb(null, '', ''))

    await mgr.stopAgent('coder')

    expect(mockExecFile.mock.calls[0][1]).toEqual(
      ['ps', '-a', '--filter', 'label=agenthix-local.agent=coder', '--filter', 'label=com.docker.compose.project=agenthix-local-agents', '--format', '{{.Names}}']
    )
  })

  it('stopAgent does not throw when docker is unavailable, and reports nothing was confirmed removed', async () => {
    const mgr = new AgentContainerManager()
    mockExecFile.mockImplementationOnce((_cmd, _args, cb: any) => cb(new Error('docker not found'), '', ''))

    await expect(mgr.stopAgent('coder')).resolves.toEqual({ allRemoved: false })
  })

  it('stopAgent skips a container with a live run, leaves it in place, and reports allRemoved: false — the idle sibling is still removed', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()
    const idleName = await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
    const activeName = await mgr.ensureRunning(BETA_RW, NO_CTX, EMPTY_MOUNTS)
    mgr.markRunStart(activeName) // this boundary has a live run in flight

    mockDockerSequence({ stdout: `${idleName}\n${activeName}\n` })
    const callsBeforeStop = mockExecFile.mock.calls.length
    const result = await mgr.stopAgent('coder')

    expect(result).toEqual({ allRemoved: false })
    // Only one `rm -f` fired by stopAgent itself — for the idle container, never
    // the active one. (Slicing from callsBeforeStop excludes the pre-start `rm -f`
    // each ensureRunning() call above already issued as its own stale-container cleanup.)
    const rmCalls = mockExecFile.mock.calls
      .slice(callsBeforeStop)
      .filter(c => (c[1] as string[])[0] === 'rm')
      .map(c => c[1] as string[])
    expect(rmCalls).toEqual([['rm', '-f', idleName]])
  })

  it('stopAgent prunes each removed container\'s state entry — "pruned on removal" made true', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()
    const name = await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
    mgr.markRunStart(name)  // give it activity — proves pruning isn't just "never had state"
    mgr.markRunEnd(name)

    mockDockerSequence({ stdout: `${name}\n` }, {})
    await mgr.stopAgent('coder')

    // With the state entry pruned, a subsequent ensureRunning can't reuse via a
    // stale isRunning=true — it must go through _start again.
    mockDockerFirstStart()
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(runCalls.length).toBe(2)
  })
})

describe('nothing about a person is ever mounted', () => {
  // ADR-0058 replaced the /memory bind: what an agent knows about a person is
  // held by hq and arrives as text in the run's dispatch context. This is the
  // container-layer half of that — a bind is the one thing a prompt change
  // cannot remove, so it is asserted here rather than only in the prompt tests.
  it('starts no container with a /memory bind, even handed a memory-shaped member', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    // Cast, not a typed literal. Once AgentMounts loses its `memory` member a
    // typed fixture cannot carry one — and a fixture that cannot carry one
    // proves nothing about the manager. This hands the manager exactly what
    // containerPrep.ts used to hand it and asserts it produces no bind from it.
    const mounts = {
      ...boundaryMounts('projects/proj-alpha'),
      memory: { hostDir: `${SITE_ROOT}/agents/coder/users/user-1` },
    } as unknown as AgentMounts
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, mounts)

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    // `--memory` is the container's RAM limit, an unrelated flag of the same
    // name — matched on the bind's shape so this cannot pass by accident.
    expect(runArgs.join(' ')).not.toContain(':/memory')
    expect(runArgs.join(' ')).not.toContain('/users/')
    // The boundary bind still works: this proves the mount path ran at all,
    // rather than the whole call having failed before it built any binds.
    expect(runArgs).toContain(`${SITE_ROOT}/projects/proj-alpha:/projects/proj-alpha:rw`)
  })

  it('a container already running, with no cached signature, is recreated rather than reused', async () => {
    // Guards the property the retired memory-signature-regression cases used to
    // pin, now that AgentMounts has no removable field left to regress on: a
    // container already running when this process starts — the exact shape of
    // one left over from before a mount-shape change, such as this one's own
    // removal of the /memory bind — has no entry in the fresh in-memory
    // containerStates map. `state.mountSig` is then undefined, which can never
    // equal a real signature string, so `ensureRunning` must fall through to
    // rm + run rather than treating "already running" alone as reusable. This
    // is the mechanism that stops a pre-change container's stale bind
    // surviving into a run that never asked for it.
    const mgr = new AgentContainerManager()
    mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
      if (args?.[0] === 'inspect') cb(null, 'true\n', '')  // reports running from the very first check
      else cb(null, '', '')  // rm / run / exec
    }) as any)

    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    const rmCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')
    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(rmCalls.length).toBeGreaterThanOrEqual(1)
    expect(runCalls.length).toBe(1)
  })

  it('takes no memory member on AgentMounts any more', () => {
    // ADR-0058 removed `memory` from AgentMounts — this is the only place that
    // removal is visible at all, since vitest strips types and no runtime
    // assertion can see a member that no longer exists. The directive must sit
    // directly above the object literal: with a comment line between them,
    // `npx tsc --noEmit` reports it unused instead of catching a reintroduced
    // `memory` member.
    // @ts-expect-error
    const withMemory: AgentMounts = { boundary: { hostDir: '/site/projects/proj-alpha', containerDir: '/projects/proj-alpha' }, folders: [], locationMode: 'rw', memory: { hostDir: '/anything' } }
    expect(withMemory.folders).toEqual([])
  })

  it('takes no workspace member on AgentMounts either', () => {
    // The agent's own working directory used to reach the container as two
    // positional arguments to ensureRunning rather than as part of the mount
    // set. Now that it is gone, the same compile-time pin the memory removal
    // used keeps it from coming back the other way — as a member of the type
    // that describes what a run may reach. The directive must sit directly
    // above the object literal, or `npx tsc --noEmit` reports it unused
    // instead of catching a reintroduced member.
    // @ts-expect-error
    const withWorkspace: AgentMounts = { boundary: { hostDir: '/site/projects/proj-alpha', containerDir: '/projects/proj-alpha' }, folders: [], locationMode: 'rw', workspace: { hostDir: '/anything' } }
    expect(withWorkspace.folders).toEqual([])
  })
})

/**
 * A run reaches its own storage boundary and nothing else. The agent's own
 * working directory was the last agent-scoped bind apart from its Claude
 * credential home; both are gone, and the Claude home a container gets belongs
 * to the boundary that container is named for (spec §6.1, §6.3). These pin
 * that nothing agent-keyed is mounted or created at all.
 */
describe('nothing an agent owns reaches the container', () => {
  /** Every `-v` bind's host side, in the order docker run received them. */
  function bindSources(runArgs: string[]): string[] {
    return runArgs.filter((_, i) => runArgs[i - 1] === '-v').map(bind => bind.split(':')[0])
  }

  it('mounts no agent-scoped directory at all, and binds the boundary\'s home instead', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, ctx({ handle: 'coder' }), boundaryMounts('projects/proj-alpha'))

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    const sources = bindSources(runArgs)
    expect(sources.filter(s => s.startsWith(`${SITE_ROOT}/agents/`))).toEqual([])
    expect(sources.some(s => s.includes('coder'))).toBe(false)
    expect(sources).toContain(ALPHA_HOME)
    // Positive control: the boundary's own storage bind was built, so this
    // cannot pass by the argv having been assembled without any binds at all.
    expect(sources).toContain(`${SITE_ROOT}/projects/proj-alpha`)
  })

  it('binds the Claude home unqualified, whatever mode the storage is in', async () => {
    // The mode qualifies the owner's storage. The Claude home is not the
    // owner's storage and carries no mode of its own.
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    const mounts: AgentMounts = boundaryMounts('projects/proj-alpha', 'ro')
    await mgr.ensureRunning(ALPHA_RO, NO_CTX, mounts)

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs).toContain(`${ALPHA_HOME}:/home/appuser`)
    expect(runArgs).toContain(`${SITE_ROOT}/projects/proj-alpha:/projects/proj-alpha:ro`)
  })

  it("keeps a boundary's container for a second agent rather than recreating it", async () => {
    // A container is named for its storage boundary, which two agents working
    // in one project share, so the name alone cannot tell them apart — and
    // nothing bound into it may tell them apart either. The credential home
    // was the one bind that did: the second agent's run failed the signature
    // comparison, recreated the container, waited for the first run to drain
    // and refused if it did not finish in the drain window. Keyed by boundary,
    // both agents' runs produce one signature and share one container.
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    await mgr.ensureRunning(ALPHA_RW, ctx({ handle: 'coder' }), EMPTY_MOUNTS)
    await mgr.ensureRunning(ALPHA_RW, ctx({ handle: 'scout', sessionId: 'sess-2' }), EMPTY_MOUNTS)

    const runArgvs = mockExecFile.mock.calls
      .filter(c => (c[1] as string[])[0] === 'run')
      .map(c => c[1] as string[])
    expect(runArgvs).toHaveLength(1)
    expect(runArgvs[0]).toContain(`${ALPHA_HOME}:/home/appuser`)
    expect(runArgvs[0][runArgvs[0].indexOf('--name') + 1]).toBe(ALPHA_RW_NAME)
  })

  it('shares one container for two agents with different workspace settings', async () => {
    // The eviction test next door uses an empty mount set, which cannot show
    // that the home stopped being the discriminator with a real bind in place.
    // This is that case — and, since the container binds the whole boundary
    // (ADR-0079), a workspace's settings no longer change what is bound: two
    // agents whose runs are guarded differently still share one container.
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    await mgr.ensureRunning(ALPHA_RW, ctx({ handle: 'coder' }), boundaryMounts('projects/proj-alpha', 'rw', ['files', 'workspaces/ws-1']))
    await mgr.ensureRunning(ALPHA_RW, ctx({ handle: 'scout', sessionId: 'sess-2' }), boundaryMounts('projects/proj-alpha', 'rw', ['files']))

    expect(mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run').length).toBe(1)
    expect(mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm').length).toBe(1)  // the first start's own pre-clean, and no more
  })

  it("creates nothing under an agent's directory, and one home under the boundary's", async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, ctx({ handle: 'coder' }), boundaryMounts('projects/proj-alpha'))

    const created = [...new Set(mockFs.mkdir.mock.calls.map(c => String(c[0])))]
    expect(created.filter(p => p.includes('/agents/'))).toEqual([])
    expect(created).toContain(ALPHA_CLAUDE)
    // Positive control, same reason as above: the location pre-create still ran.
    expect(created).toContain(`${SITE_ROOT}/projects/proj-alpha/files`)
  })
})

/**
 * A credential must not outlive the authority that granted it. Its removal at
 * the end of a run follows the home's own count of runs using it, not the
 * container's, and is covered where it lives (runCleanup.test.ts). What is
 * left here is the arrival half, inside `ensureRunning`.
 */
describe("a run's credential does not outlive the run", () => {
  const HOME = ALPHA_CLAUDE
  const DOCUMENT = `${HOME}/.credentials.json`
  const SUBSCRIPTION = { kind: 'subscription' as const, provider: 'anthropic' as const, oauthJson: JSON.stringify({ claudeAiOauth: { expiresAt: 5_000 } }), grantId: 'grant-1', loginId: 'login-1' }

  it('is no longer removed by the container ending — the home count decides', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    const name = await mgr.ensureRunning(ALPHA_RW, ctx({ credential: SUBSCRIPTION }), EMPTY_MOUNTS)
    expect(credentialWrites()).toHaveLength(1)   // it really was written
    mgr.markRunStart(name)
    mockFs.rm.mockClear()

    mgr.markRunEnd(name)

    expect(mockFs.rm).not.toHaveBeenCalledWith(DOCUMENT, { force: true })
  })

  it('a later run in the same boundary, granted no subscription, still finds nothing', async () => {
    // Belt and braces with the removal above: even if the end-of-run clear
    // never happened — a crashed process, a failed unlink — the next run takes
    // the document away on arrival rather than inheriting it.
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    await mgr.ensureRunning(ALPHA_RW, ctx({ credential: SUBSCRIPTION }), EMPTY_MOUNTS)
    mockFs.rm.mockClear()

    await mgr.ensureRunning(ALPHA_RW, ctx({ sessionId: 'sess-2', credential: { kind: 'apiKey', provider: 'anthropic', apiKey: API_KEY } }), EMPTY_MOUNTS)

    expect(mockFs.rm).toHaveBeenCalledWith(DOCUMENT, { force: true })
  })
})

describe('read-only location mounts @SC-334 @SC-335', () => {
  it("locationMode ro binds the boundary's folder :ro", async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    const mounts: AgentMounts = boundaryMounts('projects/proj-alpha', 'ro', ['files', 'knowledge'])
    await mgr.ensureRunning(ALPHA_RO, NO_CTX, mounts)

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs).toContain(`${SITE_ROOT}/projects/proj-alpha:/projects/proj-alpha:ro`)
    expect(runArgs.join(' ')).not.toContain(':/projects/proj-alpha:rw')
  })

  it("locationMode rw binds the boundary's folder :rw (default)", async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    const mounts: AgentMounts = boundaryMounts('projects/proj-alpha')
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, mounts)

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs).toContain(`${SITE_ROOT}/projects/proj-alpha:/projects/proj-alpha:rw`)
  })

  it('the mode participates in the reuse signature as well as the key', async () => {
    // The mode is in the key, so an rw→ro flip already lands on a different
    // container name. It stays in the signature too: a container adopted
    // without a cached signature, or one whose name was reused, must never be
    // reused across a mode it was not started with — a plain `:rw` → `:ro`
    // string change alone does not change a container that is already running.
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    const mountsRw: AgentMounts = boundaryMounts('projects/proj-alpha')
    const mountsRo: AgentMounts = boundaryMounts('projects/proj-alpha', 'ro')

    // Same KEY deliberately — this isolates the signature's own contribution
    // from the key's, which the "at most two containers" test covers.
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, mountsRw)
    mockExecFile.mockClear()
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, mountsRo)

    const rmCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'rm')
    const runCalls = mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')
    expect(rmCalls.length).toBeGreaterThanOrEqual(1)
    expect(runCalls.length).toBe(1)
    expect(runCalls[0][1] as string[]).toContain(`${SITE_ROOT}/projects/proj-alpha:/projects/proj-alpha:ro`)
  })
})

describe('resource limits @SC-328', () => {
  // ADR-0074/0075: a container belongs to one runner in one boundary, and that
  // runner's runs execute in it at the same time — so the defaults are sized
  // for several harness processes at once (containerLimits.ts says why).
  it('applies memory and pids limits from env with defaults', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs[runArgs.indexOf('--memory') + 1]).toBe('8g')
    expect(runArgs[runArgs.indexOf('--pids-limit') + 1]).toBe('4096')
  })

  it('sets a cpu limit', async () => {
    // There was none at all: one runaway build in one boundary's container
    // could take the host's cores from every other boundary and from the site
    // process itself.
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs).toContain('--cpus')
    expect(runArgs[runArgs.indexOf('--cpus') + 1]).toBe('2')
  })

  it('honours the memory, pids and cpu overrides', async () => {
    process.env.AGENT_CONTAINER_MEMORY = '12g'
    process.env.AGENT_CONTAINER_PIDS_LIMIT = '2048'
    process.env.AGENT_CONTAINER_CPUS = '4'
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs[runArgs.indexOf('--memory') + 1]).toBe('12g')
    expect(runArgs[runArgs.indexOf('--pids-limit') + 1]).toBe('2048')
    expect(runArgs[runArgs.indexOf('--cpus') + 1]).toBe('4')
  })

  it('uses --restart no so idle-stopped containers stay down', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    const runArgs = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
    expect(runArgs[runArgs.indexOf('--restart') + 1]).toBe('no')
  })
})

/**
 * adr-0083: nothing is reset when a turn ends. What a conversation started
 * belongs to it and ends with it (conversationLifecycle.ts); the container's own
 * removal when idle (adr-0049) clears everything else.
 */
describe('the end of a run in a shared container', () => {
  function mockDockerStillRunning() {
    mockExecFile.mockImplementation(((_c: any, a: any, cb: any) => {
      if (a[0] === 'inspect') cb(null, 'true\n', '')
      else cb(null, '', '')
    }) as any)
  }

  it('runs nothing in the container, and the next run reuses it', async () => {
    const mgr = new AgentContainerManager()
    mockDockerWithRunningToggle()

    const name = await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
    mgr.markRunStart(name)
    mockExecFile.mockClear()
    mgr.markRunEnd(name)
    expect(subcommands()).toEqual([])

    mockDockerStillRunning()
    const again = await mgr.ensureRunning(ALPHA_RW, ctx({ sessionId: 'sess-2' }), EMPTY_MOUNTS)
    expect(again).toBe(name)
    expect(subcommands()).not.toContain('run')
  })
})

/**
 * An override that is not a usable value must fall back to the default rather
 * than reach docker. `??` yields only on null or undefined, so an empty variable
 * — what compose interpolates for an unset value, and what a bare
 * `AGENT_CONTAINER_CPUS=` line produces — would otherwise be handed to docker,
 * which refuses it and fails every agent run on the site until someone finds the
 * line. The site's env example already states this rule for a numeric knob.
 */
describe('an unusable limit override', () => {
  async function runArgs(): Promise<string[]> {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()
    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
    return mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')?.[1] as string[]
  }

  it('falls back to the defaults when all three are empty', async () => {
    process.env.AGENT_CONTAINER_MEMORY = ''
    process.env.AGENT_CONTAINER_PIDS_LIMIT = ''
    process.env.AGENT_CONTAINER_CPUS = ''

    const args = await runArgs()
    expect(args[args.indexOf('--memory') + 1]).toBe('8g')
    expect(args[args.indexOf('--pids-limit') + 1]).toBe('4096')
    expect(args[args.indexOf('--cpus') + 1]).toBe('2')
  })

  it('falls back on a non-numeric or non-positive value', async () => {
    process.env.AGENT_CONTAINER_MEMORY = 'plenty'
    process.env.AGENT_CONTAINER_PIDS_LIMIT = '0'
    process.env.AGENT_CONTAINER_CPUS = '-1'

    const args = await runArgs()
    expect(args[args.indexOf('--memory') + 1]).toBe('8g')
    expect(args[args.indexOf('--pids-limit') + 1]).toBe('4096')
    expect(args[args.indexOf('--cpus') + 1]).toBe('2')
  })

  it('falls back on a pids limit that is not a whole number', async () => {
    process.env.AGENT_CONTAINER_PIDS_LIMIT = '1024.5'

    const args = await runArgs()
    expect(args[args.indexOf('--pids-limit') + 1]).toBe('4096')
  })

  it('keeps a fractional cpu override, which docker accepts', async () => {
    process.env.AGENT_CONTAINER_CPUS = '1.5'

    const args = await runArgs()
    expect(args[args.indexOf('--cpus') + 1]).toBe('1.5')
  })

  it('keeps a memory override in any docker size unit', async () => {
    process.env.AGENT_CONTAINER_MEMORY = '512m'

    const args = await runArgs()
    expect(args[args.indexOf('--memory') + 1]).toBe('512m')
  })
})


/**
 * Spec §6.3: no credential is in the container's environment. An API key is
 * given to the `claude` process's own `docker exec` (model vendor
 * independence spec §1), so the container's other processes never inherit it
 * and a run with another key is not served this container's. A subscription
 * login is an OAuth document, not a key; it reaches the container as a file,
 * written into the boundary's own Claude home before the run starts
 * (boundaryClaudeHome.ts).
 */
describe('a run\'s credential reaches the container by the route its kind allows', () => {
  it('gives an API key to no container, and skips the OAuth probe', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, ctx({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: API_KEY } }), EMPTY_MOUNTS)

    const argv = runArgvFor(ALPHA_RW_NAME) ?? []
    expect(argv).not.toContain('ANTHROPIC_API_KEY')
    expect(subcommands()).not.toContain('exec')
  })

  // R-118: an argv element is readable by every user on the host through the
  // process table for as long as `docker run` lives.
  it('keeps the API key out of every argv element of the docker run, and out of its environment', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, ctx({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: API_KEY } }), EMPTY_MOUNTS)

    for (const call of mockExecFile.mock.calls) {
      expect((call[1] as string[]).some(a => a.includes(API_KEY))).toBe(false)
    }
    const runCall = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run')!
    expect(typeof runCall[2]).toBe('function')
  })

  it('does not put the key in the environment of any docker call that is not the run', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()

    await mgr.ensureRunning(ALPHA_RW, ctx({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: API_KEY } }), EMPTY_MOUNTS)

    for (const call of mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] !== 'run')) {
      expect(typeof call[2]).toBe('function')
    }
  })

  it('never forwards a subscription login as a key, and still probes for OAuth files', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()
    // A live grant, so the probe passes and the argv is what the test is about.
    mockFs.readFile.mockResolvedValue(JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() + 60 * 60_000 } }))

    await mgr.ensureRunning(
      ALPHA_RW,
      ctx({ credential: { kind: 'subscription', provider: 'anthropic', oauthJson: '{"claudeAiOauth":{"accessToken":"secret"}}', grantId: 'grant-1', loginId: 'login-1' } }),
      EMPTY_MOUNTS,
    )

    const argv = runArgvFor(ALPHA_RW_NAME) ?? []
    expect(argv.some(a => a.includes('ANTHROPIC_API_KEY'))).toBe(false)
    expect(argv.join(' ')).not.toContain('secret')
    expect(subcommands()).toContain('exec')
  })

  it('forwards nothing and probes when the run carries no credential at all', async () => {
    const mgr = new AgentContainerManager()
    mockDockerFirstStart()
    mockFs.readFile.mockResolvedValue(JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() + 60 * 60_000 } }))

    await mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)

    expect((runArgvFor(ALPHA_RW_NAME) ?? []).some(a => a.includes('ANTHROPIC_API_KEY'))).toBe(false)
    expect(subcommands()).toContain('exec')
  })
})

describe('the container network (ADR-0066)', () => {
  /** A plain storage-container start, reusing the fixtures the file's own
   *  first-start test uses (ALPHA_RW / NO_CTX / EMPTY_MOUNTS). */
  async function startStorageContainer(): Promise<string> {
    const mgr = new AgentContainerManager()
    return mgr.ensureRunning(ALPHA_RW, NO_CTX, EMPTY_MOUNTS)
  }

  it('starts a storage container on its own network', async () => {
    mockDockerFirstStart()
    const name = await startStorageContainer()
    const argv = runArgvFor(name)!
    expect(argv).toContain('--network')
    expect(argv[argv.indexOf('--network') + 1]).toBe(`${name}-net`)
  })

  it('lets an agent reach the machine on Linux as well as Docker Desktop', async () => {
    mockDockerFirstStart()
    const name = await startStorageContainer()
    const argv = runArgvFor(name)!
    expect(argv[argv.indexOf('--add-host') + 1]).toBe('host.docker.internal:host-gateway')
  })

  it('creates the network before the container', async () => {
    // mockDockerFirstStart only fails args[0]==='inspect' — 'network inspect'
    // (args[0]==='network') would succeed under it, meaning the network
    // "already exists" and no 'network create' would happen. This test needs
    // the network to be missing, so it fails 'network inspect' specifically.
    mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
      if (args?.[0] === 'inspect') cb(new Error('No such container'), '', '')
      else if (args?.[0] === 'network' && args?.[1] === 'inspect') cb(new Error('network not found'), '', '')
      else cb(null, '', '')
    }) as any)

    await startStorageContainer()

    const seq = mockExecFile.mock.calls.map(c => (c[1] as string[]).slice(0, 2).join(' '))
    expect(seq.indexOf('network create')).toBeGreaterThanOrEqual(0)
    expect(seq.indexOf('network create')).toBeLessThan(seq.indexOf('run -d'))
  })
})
