import { describe, it, expect, beforeEach, vi } from 'vitest'
import { gatePausing, gateRunContext, gateRunStopped, pauseGateRun, reachGatePause, registerGateRun, resetGateRunsForTests, stopGateRun, untilGateRunStopped } from '../toolGateRuns'
import type { RunContext } from '../types'

const ctx = (runId: string) => ({ runId }) as RunContext

describe('toolGateRuns', () => {
  beforeEach(() => resetGateRunsForTests())

  it('finds a registered turn by its run id until the run stops, and never after', () => {
    const c = ctx('run-1')
    registerGateRun(c)
    expect(gateRunContext('run-1')).toBe(c)
    expect(gateRunContext('run-2')).toBeNull()
    stopGateRun('run-1')
    expect(gateRunContext('run-1')).toBeNull()
    registerGateRun(c)
    expect(gateRunContext('run-1')).toBeNull()
    expect(gateRunStopped('run-1')).toBe(true)
  })

  it('passes a decision through while the run is live, and answers for it once the run stops', async () => {
    await expect(untilGateRunStopped('run-1', Promise.resolve('allow'), 'stopped')).resolves.toBe('allow')
    const pending = untilGateRunStopped('run-2', new Promise<string>(() => {}), 'stopped')
    stopGateRun('run-2')
    await expect(pending).resolves.toBe('stopped')
    await expect(untilGateRunStopped('run-2', Promise.resolve('allow'), 'stopped')).resolves.toBe('stopped')
  })

  it('passes a rejection through', async () => {
    await expect(untilGateRunStopped('run-3', Promise.reject(new Error('x')), 'stopped')).rejects.toThrow('x')
  })
})

describe('toolGateRuns — a run asked to pause', () => {
  beforeEach(() => resetGateRunsForTests())

  it('hands the pause to the next decision once, and forgets it when the run stops', () => {
    const reached = vi.fn()
    pauseGateRun('run-1', reached)
    expect(gatePausing('run-1')).toBe(true)
    expect(reachGatePause('run-1')).toBe(true)
    expect(reached).toHaveBeenCalledTimes(1)
    expect(reachGatePause('run-1')).toBe(false)
    expect(reached).toHaveBeenCalledTimes(1)

    pauseGateRun('run-2', reached)
    stopGateRun('run-2')
    expect(gatePausing('run-2')).toBe(false)
    expect(reachGatePause('run-2')).toBe(false)
  })

  it('never pauses a run that has already stopped', () => {
    stopGateRun('run-3')
    const reached = vi.fn()
    pauseGateRun('run-3', reached)
    expect(gatePausing('run-3')).toBe(false)
  })
})
