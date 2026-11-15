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
vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn() },
}))

/**
 * A wedged daemon makes `docker rm` hang rather than fail. The idle sweep and `stopAgent` give it a deadline, so
 * a removal that never answers fails the sweep instead of holding `state.stopping` and every later run.
 */
import { AgentContainerManager } from '../AgentContainerManager'
import { DOCKER_SWEEP_TIMEOUT_MS } from '../containerLifecycle'
import { _resetSubscribers } from '../containerDestroyed'
const { execFile } = await import('node:child_process')
const mockExecFile = vi.mocked(execFile)

const NAME = 'agenthix-agent-project-proj-alpha-project-rw'

/** Lists the container, and never answers a removal. */
function mockHangingRemoval() {
  mockExecFile.mockImplementation(((_cmd: any, args: any, cb: any) => {
    if (args[0] === 'rm') return
    if (args[0] === 'ps') cb(null, `${NAME}\tcoder\n`, '')
    else cb(null, '', '')
  }) as any)
}

describe('a docker removal that never answers', () => {
  let manager: AgentContainerManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    process.env.HOST_NAMESPACE = 'agenthix'
    manager = new AgentContainerManager()
    mockHangingRemoval()
  })

  afterEach(() => { vi.useRealTimers(); _resetSubscribers() })

  it('does not hold the idle sweep for good', async () => {
    vi.setSystemTime(Date.now() + 3_600_000)

    const swept = manager.sweepIdle(60_000)
    await vi.advanceTimersByTimeAsync(DOCKER_SWEEP_TIMEOUT_MS + 1_000)

    await expect(swept).resolves.toBeUndefined()
  })

  it('does not hold stopAgent for good, and reports the container as not removed', async () => {
    const stopped = manager.stopAgent('coder')
    await vi.advanceTimersByTimeAsync(DOCKER_SWEEP_TIMEOUT_MS + 1_000)

    await expect(stopped).resolves.toEqual({ allRemoved: false })
  })
})
