/**
 * ADR-0074: a container is keyed on its boundary AND its runner. In a project X
 * with members Alice and Bob there are three containers — Alice × X, Bob × X and
 * X × project — all mounting X's storage, each with its own harness home, and
 * no member's container ever mounts another member's home or the project's own.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('../credentialFile', () => import('./fakeCredentialFile'))
vi.mock('../homeFolder', () => import('./fakeHomeFolder'))
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
  Logger: vi.fn().mockImplementation(function () { return ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}))
vi.mock('../../../server/hq/hqConnection', () => ({ hqConnectionManager: { sendEvent: vi.fn() } }))
vi.mock('#db', () => ({ prisma: {} }))

import type { CapabilityRunner } from '@agenthix/core'
import { AgentContainerManager } from '../AgentContainerManager'
import { onContainerDestroyed, _resetSubscribers } from '../containerDestroyed'
import { resolveAccessibleLocations, resolveBoundaryMount } from '../locationResolver'
import type { AgentMounts, ContainerContext, ContainerKey, StorageBoundaryKey } from '../containerTypes'
const { execFile } = await import('node:child_process')
const mockExecFile = vi.mocked(execFile)

const SITE_ROOT = '/site'
const ALICE: CapabilityRunner = { kind: 'person', userId: 'u-alice' }
const BOB: CapabilityRunner = { kind: 'person', userId: 'u-bob' }
const PROJECT_X: CapabilityRunner = { kind: 'project', projectId: 'proj-x' }

const keyFor = (runner: CapabilityRunner): StorageBoundaryKey =>
  ({ scope: 'storage', ownerType: 'project', ownerId: 'proj-x', mode: 'rw', runner })

const CTX: ContainerContext = { handle: 'coder', runtime: 'opencode', sessionId: 's1', credential: null }

/** X's whole storage, as containerPrep builds it for every run in X. */
const X_MOUNTS: AgentMounts = {
  boundary: resolveBoundaryMount({ ownerType: 'project', ownerId: 'proj-x' }, SITE_ROOT),
  folders: resolveAccessibleLocations({ ownerType: 'project', ownerId: 'proj-x', name: 'X' }, SITE_ROOT, [{ id: 'ws-1', name: 'web' }]),
  locationMode: 'rw',
}

const HOMES = {
  alice: `${SITE_ROOT}/homes/users/u-alice/proj-x`,
  bob: `${SITE_ROOT}/homes/users/u-bob/proj-x`,
  project: `${SITE_ROOT}/homes/projects/proj-x`,
}

function callbackOf(a3: unknown, a4?: unknown): (err: Error | null, stdout: string, stderr: string) => void {
  return (typeof a3 === 'function' ? a3 : a4) as (err: Error | null, stdout: string, stderr: string) => void
}

/** A daemon that remembers what it started and lists it back with its labels. */
function fakeDocker() {
  const running = new Map<string, { owner: string; runner: string }>()
  const removed: string[] = []
  mockExecFile.mockImplementation(((_cmd: string, args: string[], a3: unknown, a4?: unknown) => {
    const cb = callbackOf(a3, a4)
    const label = (key: string) => {
      const i = args.findIndex((a, j) => args[j - 1] === '--label' && a.startsWith(`${key}=`))
      return i >= 0 ? args[i].slice(key.length + 1) : ''
    }
    if (args[0] === 'inspect') {
      const name = args[args.length - 1]
      return running.has(name) ? cb(null, 'true\n', '') : cb(new Error('No such container'), '', '')
    }
    if (args[0] === 'run') {
      running.set(args[args.indexOf('--name') + 1], { owner: label('agenthix.owner'), runner: label('agenthix.runner') })
      return cb(null, '', '')
    }
    if (args[0] === 'rm') {
      const name = args[args.length - 1]
      if (running.delete(name)) removed.push(name)
      return cb(null, '', '')
    }
    if (args[0] === 'ps') {
      const format = args[args.indexOf('--format') + 1] ?? ''
      const lines = [...running].map(([name, l]) =>
        format.includes('agenthix.runner') ? `${name}\t${l.owner}\t${l.runner}` : `${name}\tcoder`)
      return cb(null, lines.join('\n') + (lines.length ? '\n' : ''), '')
    }
    return cb(null, '', '')
  }) as never)
  return { running, removed }
}

function runArgv(name: string): string[] {
  const call = mockExecFile.mock.calls.find(c => (c[1] as string[])[0] === 'run' && (c[1] as string[]).includes(name))
  if (!call) throw new Error(`no docker run for ${name}`)
  return call[1] as string[]
}

/** Every `-v` bind in a docker run argv. */
function binds(argv: string[]): string[] {
  return argv.filter((_, i) => argv[i - 1] === '-v')
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SITE_ROOT = SITE_ROOT
  process.env.HOST_NAMESPACE = 'agenthix'
  process.env.AGENT_CONTAINER_ISOLATION = 'true'
  _resetSubscribers()
})
afterEach(() => {
  delete process.env.HOST_NAMESPACE
  delete process.env.AGENT_CONTAINER_ISOLATION
})

describe('boundary × runner: three containers in one project', () => {
  it('Alice × X, Bob × X and X × project are three containers', async () => {
    const mgr = new AgentContainerManager()
    fakeDocker()

    const names = [
      await mgr.ensureRunning(keyFor(ALICE), CTX, X_MOUNTS),
      await mgr.ensureRunning(keyFor(BOB), CTX, X_MOUNTS),
      await mgr.ensureRunning(keyFor(PROJECT_X), CTX, X_MOUNTS),
    ]

    expect(names).toEqual([
      'agenthix-agent-project-proj-x-user-u-alice-rw',
      'agenthix-agent-project-proj-x-user-u-bob-rw',
      'agenthix-agent-project-proj-x-project-rw',
    ])
    expect(mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')).toHaveLength(3)
  })

  it("two members' containers mount the same storage, and neither mounts the other's home", async () => {
    const mgr = new AgentContainerManager()
    fakeDocker()
    const alice = binds(runArgv(await mgr.ensureRunning(keyFor(ALICE), CTX, X_MOUNTS)))
    const bob = binds(runArgv(await mgr.ensureRunning(keyFor(BOB), CTX, X_MOUNTS)))

    const storage = (bs: string[]) => bs.filter(b => b.startsWith(`${SITE_ROOT}/projects/`)).sort()
    expect(storage(alice)).toEqual(storage(bob))
    expect(storage(alice).length).toBeGreaterThan(0)

    expect(alice).toContain(`${HOMES.alice}:/home/appuser`)
    expect(bob).toContain(`${HOMES.bob}:/home/appuser`)
    expect(alice.some(b => b.startsWith(HOMES.bob))).toBe(false)
    expect(bob.some(b => b.startsWith(HOMES.alice))).toBe(false)
  })

  it("never mounts the project's own home into a member's container", async () => {
    const mgr = new AgentContainerManager()
    fakeDocker()
    const alice = binds(runArgv(await mgr.ensureRunning(keyFor(ALICE), CTX, X_MOUNTS)))
    const project = binds(runArgv(await mgr.ensureRunning(keyFor(PROJECT_X), CTX, X_MOUNTS)))

    expect(project).toContain(`${HOMES.project}:/home/appuser`)
    expect(alice.some(b => b.includes('/homes/projects/'))).toBe(false)
    // And no member's home in the project's container either.
    expect(project.some(b => b.includes('/homes/users/'))).toBe(false)
  })

  it('keeps a person\'s own storage on the one container it always had', async () => {
    const mgr = new AgentContainerManager()
    fakeDocker()
    const own: ContainerKey = { scope: 'storage', ownerType: 'user', ownerId: 'u-alice', mode: 'rw', runner: ALICE }

    const name = await mgr.ensureRunning(own, CTX, { boundary: { hostDir: '/site/projects/proj-alpha', containerDir: '/projects/proj-alpha' }, folders: [], locationMode: 'rw' })

    expect(name).toBe('agenthix-agent-user-u-alice-rw')
    expect(binds(runArgv(name))).toContain(`${SITE_ROOT}/homes/users/u-alice/personal:/home/appuser`)
  })

  it("refuses a key whose runner does not fit its boundary — never someone else's home", async () => {
    const mgr = new AgentContainerManager()
    fakeDocker()
    const intoAlicesOwn: ContainerKey = { scope: 'storage', ownerType: 'user', ownerId: 'u-alice', mode: 'rw', runner: BOB }
    const otherProject: ContainerKey = { ...keyFor(PROJECT_X), runner: { kind: 'project', projectId: 'proj-y' } }

    await expect(mgr.ensureRunning(intoAlicesOwn, CTX, X_MOUNTS)).rejects.toThrow(/does not fit/)
    await expect(mgr.ensureRunning(otherProject, CTX, X_MOUNTS)).rejects.toThrow(/does not fit/)
    expect(mockExecFile.mock.calls.filter(c => (c[1] as string[])[0] === 'run')).toHaveLength(0)
  })

  it('labels each container with its runner', async () => {
    const mgr = new AgentContainerManager()
    fakeDocker()
    const argv = runArgv(await mgr.ensureRunning(keyFor(ALICE), CTX, X_MOUNTS))
    expect(argv).toContain('agenthix.runner=user:u-alice')
    expect(argv).toContain('agenthix.owner=project:proj-x')
  })
})

describe('the idle sweep distinguishes runners', () => {
  it("removes Bob's idle container and leaves Alice's, which has a run in it", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const mgr = new AgentContainerManager()
      const { removed } = fakeDocker()
      const alice = await mgr.ensureRunning(keyFor(ALICE), CTX, X_MOUNTS)
      const bob = await mgr.ensureRunning(keyFor(BOB), CTX, X_MOUNTS)
      mgr.markRunStart(alice)

      vi.setSystemTime(Date.now() + 3_600_000)
      await mgr.sweepIdle(60_000)

      expect(removed).toEqual([bob])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('removeContainersFor', () => {
  async function threeUp() {
    const mgr = new AgentContainerManager()
    const docker = fakeDocker()
    const names = {
      alice: await mgr.ensureRunning(keyFor(ALICE), CTX, X_MOUNTS),
      bob: await mgr.ensureRunning(keyFor(BOB), CTX, X_MOUNTS),
      project: await mgr.ensureRunning(keyFor(PROJECT_X), CTX, X_MOUNTS),
      aliceOwn: await mgr.ensureRunning(
        { scope: 'storage', ownerType: 'user', ownerId: 'u-alice', mode: 'rw', runner: ALICE }, CTX, { boundary: { hostDir: '/site/projects/proj-alpha', containerDir: '/projects/proj-alpha' }, folders: [], locationMode: 'rw' }),
    }
    return { mgr, names, ...docker }
  }

  it("a member leaving a project: removes their container there and nobody else's", async () => {
    const { mgr, names, removed } = await threeUp()

    const count = await mgr.removeContainersFor({ runner: ALICE, ownerType: 'project', ownerId: 'proj-x' })

    expect(count).toBe(1)
    expect(removed).toEqual([names.alice])
  })

  it('a person leaving the organisation: every container that runs for them, their own storage included', async () => {
    const { mgr, names, removed } = await threeUp()

    expect(await mgr.removeContainersFor({ runner: ALICE })).toBe(2)
    expect(removed.sort()).toEqual([names.alice, names.aliceOwn].sort())
  })

  it("a project deleted: every container over its storage, members' and its own", async () => {
    const { mgr, names, removed } = await threeUp()

    expect(await mgr.removeContainersFor({ ownerType: 'project', ownerId: 'proj-x' })).toBe(3)
    expect(removed.sort()).toEqual([names.alice, names.bob, names.project].sort())
  })

  it('refuses, removing nothing, while a matching container has a run in it', async () => {
    const { mgr, names, removed } = await threeUp()
    mgr.markRunStart(names.bob)

    await expect(mgr.removeContainersFor({ ownerType: 'project', ownerId: 'proj-x' })).rejects.toThrow(/run still active/)
    expect(removed).toEqual([])
  })

  it('refuses a call with no filter at all', async () => {
    const { mgr, removed } = await threeUp()
    await expect(mgr.removeContainersFor({})).rejects.toThrow(/at least one/)
    expect(removed).toEqual([])
  })

  it('announces each removal, so anything keeping a record of it can drop it', async () => {
    const { mgr, names } = await threeUp()
    const destroyed: string[] = []
    onContainerDestroyed(name => destroyed.push(name))

    await mgr.removeContainersFor({ runner: ALICE, ownerId: 'proj-x' })

    expect(destroyed).toEqual([names.alice])
  })

  it('is idempotent: a second call finds nothing and removes nothing', async () => {
    const { mgr } = await threeUp()
    await mgr.removeContainersFor({ runner: BOB })
    expect(await mgr.removeContainersFor({ runner: BOB })).toBe(0)
  })

  it('throws when a removal fails, so the caller does not report it done', async () => {
    const { mgr } = await threeUp()
    const inner = mockExecFile.getMockImplementation()!
    mockExecFile.mockImplementation(((cmd: string, args: string[], a3: unknown, a4?: unknown) =>
      args[0] === 'rm' ? callbackOf(a3, a4)(new Error('daemon busy'), '', '') : (inner as Function)(cmd, args, a3, a4)) as never)

    await expect(mgr.removeContainersFor({ runner: BOB })).rejects.toThrow(/Could not remove 1/)
  })
})
