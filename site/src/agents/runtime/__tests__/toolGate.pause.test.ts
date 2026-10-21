import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: h.create } } }))

import { decideToolCall, RUN_PAUSED_TEXT } from '../toolGate'
import type { GateCall } from '../toolGate'
import { containerHarnessPathPolicy } from '../harnessPathRule'
import { pauseGateRun, resetGateRunsForTests, stopGateRun } from '../toolGateRuns'
import type { RunContext } from '../types'

const context = { runId: 'run-1', sessionId: 's-1', cwd: '/projects/p1/files', bypassed: true, riskRules: null } as RunContext
const options = { harnessPaths: containerHarnessPathPolicy('c1', '/projects/p1/files', [], async p => p) }
const call: GateCall = { toolName: 'bash', input: { command: 'make test' }, toolUseId: 'call-1' }
const rows = () => h.create.mock.calls.map(c => c[0].data)

describe('a run asked to pause, at the tool gate', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests() })

  it('lets the step already allowed finish, then refuses the next call and pauses the run there', async () => {
    expect(await decideToolCall(context, call, options)).toEqual({ allow: true })

    const reached = vi.fn(() => stopGateRun('run-1'))
    pauseGateRun('run-1', reached)
    expect(reached).not.toHaveBeenCalled()

    const next = await decideToolCall(context, { ...call, toolUseId: 'call-2' }, options)
    expect(next).toEqual({ allow: false, reason: RUN_PAUSED_TEXT })
    expect(reached).toHaveBeenCalledTimes(1)
    expect(rows()[1]).toMatchObject({ toolUseId: 'call-2', blocked: true, blockReason: 'run-paused' })

    // Paused, the run allows nothing more.
    expect((await decideToolCall(context, { ...call, toolUseId: 'call-3' }, options)).allow).toBe(false)
    expect(reached).toHaveBeenCalledTimes(1)
  })

  it('refuses, and pauses at, a call whose decision the pause overtook', async () => {
    let resolvePath: (p: string) => void = () => {}
    const slow = { harnessPaths: containerHarnessPathPolicy('c1', '/projects/p1/files', [], () => new Promise<string>(r => { resolvePath = r })) }
    const reached = vi.fn()
    const deciding = decideToolCall(context, { toolName: 'read_file', input: {}, toolUseId: 'call-4', paths: ['/projects/p1/files/a'] }, slow)
    await Promise.resolve()
    pauseGateRun('run-1', reached)
    resolvePath('/projects/p1/files/a')
    expect(await deciding).toEqual({ allow: false, reason: RUN_PAUSED_TEXT })
    expect(reached).toHaveBeenCalledTimes(1)
    expect(rows()).toEqual([expect.objectContaining({ toolUseId: 'call-4', blocked: true, blockReason: 'run-paused' })])
  })

  it('does not touch other runs', async () => {
    pauseGateRun('run-2', vi.fn())
    expect(await decideToolCall(context, call, options)).toEqual({ allow: true })
  })
})
