import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('#db', () => ({ prisma: {} }))
const lifecycle = vi.hoisted(() => ({ docker: vi.fn(), dockerWithin: vi.fn() }))
vi.mock('../../../agents/runtime/containerLifecycle', () => lifecycle)
// The engine's own limit reader, without the engine: the real one reads the same variable.
vi.mock('../../../agents/runtime/AgentEngine', async () => {
  const { positiveNumberEnv } = await import('../../../agents/runtime/containerLimits')
  return { maxConcurrentRuns: () => positiveNumberEnv('AGENT_MAX_CONCURRENT_RUNS', 5, { integer: true }) }
})

import { takeHealth, startHealthReports } from '../siteHealthReport'

const GIB = 1024 ** 3
const now = () => new Date('2026-10-09T10:00:00.000Z')
const disk = async () => ({ freeBytes: 182 * GIB, totalBytes: 500 * GIB })
const roomy = () => ({ availableBytes: 20 * GIB, totalBytes: 64 * GIB })

function dockerAnswering(labels = '0.4.0\n') {
  return vi.fn(async (args: string[]) => {
    if (args[0] === 'version') return { stdout: '27.3.1\n', stderr: '' }
    if (args[1] === 'ls') return { stdout: 'abc123\n', stderr: '' }
    return { stdout: labels, stderr: '' }
  })
}

describe("a site's health report @SC-766", () => {
  afterEach(() => { delete process.env.AGENT_MAX_CONCURRENT_RUNS })

  it('says what runs, the limit, the disk, Docker and the image', async () => {
    process.env.AGENT_MAX_CONCURRENT_RUNS = '4'
    const health = await takeHealth({ docker: dockerAnswering(), countRunning: async () => 1, disk, memory: roomy, now })
    expect(health).toEqual({
      takenAt: '2026-10-09T10:00:00.000Z',
      runs: { running: 1, maxAtOnce: 4 },
      disk: { freeBytes: 182 * GIB, totalBytes: 500 * GIB },
      docker: { running: true, version: '27.3.1' },
      agentImage: { name: 'agenthix-agent', present: true, version: '0.4.0' },
      ceilings: {
        machine: { memoryBytesPerContainer: 8 * GIB, cpusPerContainer: 2, processesPerContainer: 4096, containersAtOnce: 4 },
        ceilings: { memoryBytesPerContainer: 8 * GIB, cpusPerContainer: 2, processesPerContainer: 4096, containersAtOnce: 4 },
      },
      memoryNearlyFull: false,
    })
  })

  it("by default asks Docker through the site's own deadline-bearing call, and reads its answers", async () => {
    lifecycle.dockerWithin.mockImplementation(dockerAnswering())
    const health = await takeHealth({ countRunning: async () => 0, disk, now })
    expect(health.docker).toEqual({ running: true, version: '27.3.1' })
    expect(health.agentImage).toEqual({ name: 'agenthix-agent', present: true, version: '0.4.0' })
    expect(lifecycle.dockerWithin.mock.calls.map(([args]) => args[0])).toEqual(['version', 'image', 'image'])
  })

  it('reports Docker not running, with no image, rather than failing', async () => {
    const docker = vi.fn(async () => { throw new Error('Cannot connect to the Docker daemon') })
    const health = await takeHealth({ docker, countRunning: async () => 0, disk, now })
    expect(health.docker).toEqual({ running: false, version: null })
    expect(health.agentImage).toMatchObject({ present: false, version: null })
  })

  it('has no image version when the image carries no label', async () => {
    const health = await takeHealth({ docker: dockerAnswering('<no value>\n'), countRunning: async () => 0, disk, now })
    expect(health.agentImage.version).toBeNull()
  })

  it('reports the ceilings each run gets, and never the machine figures the host service gives the site', async () => {
    vi.resetModules()
    vi.doMock('../../host/hostFigures', () => ({
      hostFigures: { machineCeilings: () => ({ memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 1, processesPerContainer: 512, containersAtOnce: 2 }) },
    }))
    try {
      const { takeHealth: take } = await import('../siteHealthReport')
      const health = await take({ docker: dockerAnswering(), countRunning: async () => 0, disk, now })
      expect(health.ceilings).toEqual({
        machine: { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 1, processesPerContainer: 512, containersAtOnce: 2 },
        ceilings: { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 1, processesPerContainer: 512, containersAtOnce: 2 },
      })
      expect(Object.keys(health.ceilings ?? {}).sort()).toEqual(['ceilings', 'machine'])
    } finally {
      vi.doUnmock('../../host/hostFigures')
      vi.resetModules()
    }
  })

  it('reports an unreadable disk and run count as unknown, not as a failure', async () => {
    const health = await takeHealth({
      docker: dockerAnswering(),
      countRunning: async () => { throw new Error('db down') },
      disk: async () => { throw new Error('ENOENT') },
      now,
    })
    expect(health.disk).toBeNull()
    expect(health.runs.running).toBe(0)
  })

  it('reports at once, then on a timer, until stopped', async () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn()
      const stop = startHealthReports(send, { docker: dockerAnswering(), countRunning: async () => 0, disk, now })
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
      await vi.advanceTimersByTimeAsync(60_000)
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
      stop()
      await vi.advanceTimersByTimeAsync(120_000)
      expect(send).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the machine nearly out of memory', () => {
  const report = (availableGib: number) =>
    takeHealth({ docker: dockerAnswering(), countRunning: async () => 0, disk, memory: () => ({ availableBytes: availableGib * GIB, totalBytes: 64 * GIB }), now })

  it('is a condition with no figure in it, held until memory is back with room to spare', async () => {
    expect((await report(20)).memoryNearlyFull).toBe(false)
    const short = await report(1)
    expect(short.memoryNearlyFull).toBe(true)
    expect(JSON.stringify(short)).not.toMatch(/available|freemem|usedBytes/i)
    // Just over the threshold is not enough to clear it, so a machine hovering there is not warned of it again and again.
    expect((await report(1.6)).memoryNearlyFull).toBe(true)
    expect((await report(2)).memoryNearlyFull).toBe(false)
    expect((await report(1.6)).memoryNearlyFull).toBe(false)
  })
})
