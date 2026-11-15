import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('../credentialFile', () => import('./fakeCredentialFile'))
vi.mock('../homeFolder', () => import('./fakeHomeFolder'))
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
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

// The host service, as the site reads it from the figures socket (host-management spec §8).
const host = vi.hoisted(() => ({
  problem: null as string | null,
  ceilings: null as null | { memoryBytesPerContainer: number; cpusPerContainer: number; processesPerContainer: number; containersAtOnce: number },
}))
vi.mock('../../../server/host/hostFigures', () => ({
  hostFigures: {
    protectionsProblem: async () => host.problem,
    machineCeilings: () => host.ceilings,
    onChange: () => {},
  },
}))

import { AgentContainerManager } from '../AgentContainerManager'
import { ReadableRunError } from '../readableRunError'
import type { AgentMounts, ContainerContext, ContainerKey } from '../containerTypes'
const { execFile } = await import('node:child_process')
const mockExecFile = vi.mocked(execFile)
import fs from 'node:fs/promises'
const mockFs = vi.mocked(fs)

const GIB = 1024 ** 3
const KEY: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-alpha', mode: 'rw', runner: { kind: 'project', projectId: 'proj-alpha' } }
const MOUNTS: AgentMounts = { boundary: { hostDir: '/site/projects/proj-alpha', containerDir: '/projects/proj-alpha' }, folders: [], locationMode: 'rw' }
const CTX: ContainerContext = { handle: 'coder', runtime: 'claude-sdk', sessionId: 'sess-1', credential: null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- execFile's overloads: the callback is the third argument or the fourth
const callbackOf = (a3: any, a4?: any): ((err: Error | null, stdout: string, stderr: string) => void) => (typeof a3 === 'function' ? a3 : a4)

let runs: string[][]
beforeEach(() => {
  vi.clearAllMocks()
  host.problem = null
  host.ceilings = null
  runs = []
  const running = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the mock stands in for every execFile overload
  mockExecFile.mockImplementation(((_cmd: any, args: any, a3: any, a4?: any) => {
    const cb = callbackOf(a3, a4)
    if (args?.[0] === 'inspect') {
      const name = args[args.length - 1]
      cb(running.has(name) ? null : new Error('No such container'), running.has(name) ? 'true\n' : '', '')
    } else if (args?.[0] === 'run') {
      runs.push(args)
      running.add(args[args.indexOf('--name') + 1])
      cb(null, '', '')
    } else cb(null, '', '')
  }) as never)
})

const flag = (args: string[], name: string) => args[args.indexOf(name) + 1]

describe('a site the host service runs', () => {
  it('starts no agent until the protections hold, and says so in words @SC-825', async () => {
    host.problem = 'This run did not start: the protections are not in place.'
    const err = await new AgentContainerManager().ensureRunning(KEY, CTX, MOUNTS).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ReadableRunError)
    expect((err as Error).message).toBe('This run did not start: the protections are not in place.')
    expect(mockExecFile).not.toHaveBeenCalled()
    expect(mockFs.writeFile).not.toHaveBeenCalled()
  })

  it('starts none in a container already up either, once they stop holding @SC-825', async () => {
    const manager = new AgentContainerManager()
    await manager.ensureRunning(KEY, CTX, MOUNTS)
    host.problem = 'This run did not start: the protections are not in place.'
    await expect(manager.ensureRunning(KEY, CTX, MOUNTS)).rejects.toBeInstanceOf(ReadableRunError)
    expect(runs).toHaveLength(1)
  })

  it('gives each container the machine’s ceilings @SC-826', async () => {
    host.ceilings = { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 1.5, processesPerContainer: 512, containersAtOnce: 2 }
    await new AgentContainerManager().ensureRunning(KEY, CTX, MOUNTS)
    expect(flag(runs[0], '--memory')).toBe(`${4 * GIB}b`)
    expect(flag(runs[0], '--cpus')).toBe('1.5')
    expect(flag(runs[0], '--pids-limit')).toBe('512')
  })

  it('narrows them by its own setting, and never raises them by it @SC-826', async () => {
    host.ceilings = { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 2 }
    process.env.AGENT_CONTAINER_MEMORY = '2g'
    process.env.AGENT_CONTAINER_PIDS_LIMIT = '9999'
    try {
      await new AgentContainerManager().ensureRunning(KEY, CTX, MOUNTS)
    } finally {
      delete process.env.AGENT_CONTAINER_MEMORY
      delete process.env.AGENT_CONTAINER_PIDS_LIMIT
    }
    expect(flag(runs[0], '--memory')).toBe(`${2 * GIB}b`)
    expect(flag(runs[0], '--pids-limit')).toBe('512')
  })

  it('starts the next run in a new container once the ceilings change and no run is left in the old one @SC-826', async () => {
    const manager = new AgentContainerManager()
    host.ceilings = { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 2 }
    await manager.ensureRunning(KEY, CTX, MOUNTS)
    await manager.ensureRunning(KEY, CTX, MOUNTS)
    expect(runs).toHaveLength(1)
    host.ceilings = { ...host.ceilings, memoryBytesPerContainer: 6 * GIB }
    await manager.ensureRunning(KEY, CTX, MOUNTS)
    expect(runs).toHaveLength(2)
    expect(flag(runs[1], '--memory')).toBe(`${6 * GIB}b`)
  })
})

describe('a workspace made a Git repository while runs go @SC-1723', () => {
  const CODE = { ...MOUNTS, readOnly: [{ hostDir: '/site/projects/proj-alpha/workspaces/w1', containerDir: '/projects/proj-alpha/workspaces/w1' }] }

  it('a run on a branch never joins the container that still has the workspace writable: it waits, and starts once runs end', async () => {
    const manager = new AgentContainerManager(5)
    const name = await manager.ensureRunning(KEY, CTX, MOUNTS)
    manager.markRunStart(name)
    const told: boolean[] = []
    const code = manager.ensureRunning(KEY, { ...CTX, codeWork: true, onWaitForBinds: (w) => told.push(w) }, CODE)
    await vi.waitFor(() => expect(told).toEqual([true]))
    // While it waits, no other run joins the old container either, or it might never empty.
    let otherDone = false
    const other = manager.ensureRunning(KEY, CTX, CODE).then((n) => { otherDone = true; return n })
    await new Promise((r) => setTimeout(r, 30))
    expect(otherDone).toBe(false)
    expect(runs).toHaveLength(1)
    manager.markRunEnd(name)
    await expect(code).resolves.toBe(name)
    await expect(other).resolves.toBe(name)
    expect(told).toEqual([true, false])
    expect(runs).toHaveLength(2)
    expect(runs[1]).toContain('/site/projects/proj-alpha/workspaces/w1:/projects/proj-alpha/workspaces/w1:ro')
  })

  it('a run that is not on a branch still joins the old container while nothing waits for it to empty', async () => {
    const manager = new AgentContainerManager(5)
    const name = await manager.ensureRunning(KEY, CTX, MOUNTS)
    manager.markRunStart(name)
    await expect(manager.ensureRunning(KEY, CTX, CODE)).resolves.toBe(name)
    expect(runs).toHaveLength(1)
  })

  it('stops waiting, with words a person can read, once its run was stopped', async () => {
    const manager = new AgentContainerManager(5)
    const name = await manager.ensureRunning(KEY, CTX, MOUNTS)
    manager.markRunStart(name)
    let wanted = true
    const code = manager.ensureRunning(KEY, { ...CTX, codeWork: true, stillWanted: async () => wanted }, CODE)
    wanted = false
    await expect(code).rejects.toBeInstanceOf(ReadableRunError)
    expect(runs).toHaveLength(1)
  })
})
