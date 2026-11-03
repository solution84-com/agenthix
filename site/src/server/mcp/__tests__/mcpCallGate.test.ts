import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: h.create } } }))

import { refusePlatformCall, NO_TURN_CALL_TEXT } from '../mcpCallGate'
import { decideToolCall, RUN_PAUSED_TEXT, RUN_STOPPED_TEXT } from '../../../agents/runtime/toolGate'
import { pauseGateRun, resetGateRunsForTests, stopGateRun } from '../../../agents/runtime/toolGateRuns'
import { resetPassesForTests } from '../../../agents/runtime/gatePasses'
import type { RunContext } from '../../../agents/runtime/types'

const turn = (over: Partial<RunContext> = {}) => ({
  runId: 'run-1', sessionId: 's1', taskId: null, cwd: '/w', bypassed: false, riskRules: null,
  allowedTools: [{ name: 'update_task', state: 'always' }, { name: 'deploy', state: 'ask' }],
  allowedBashPatterns: [],
  approvedManifest: { tools: [], bashPatterns: [], approvedAt: 't' },
  deferredManifest: { tools: [], bashPatterns: [] },
  ...over,
}) as RunContext
const rows = () => h.create.mock.calls.map(c => c[0].data)

describe('/mcp enforces the gate on every tool call', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests(); resetPassesForTests() })

  it('refuses an ask tool sent straight to /mcp, records the row and the request', async () => {
    const ctx = turn()
    const refusal = await refusePlatformCall(ctx, 'run-1', 'deploy', { to: 'prod' })
    expect(refusal).toMatch(/needs a person's approval/)
    expect(rows()).toEqual([expect.objectContaining({ runId: 'run-1', toolName: 'deploy', blocked: true, blockReason: 'tool-deferred' })])
    expect(ctx.deferredManifest!.tools).toEqual([{ name: 'deploy' }])
  })

  it('serves an ask tool the run\'s approved manifest holds, and an always tool, each with its row', async () => {
    const ctx = turn({ approvedManifest: { tools: ['deploy'], bashPatterns: [], approvedAt: 't' } })
    expect(await refusePlatformCall(ctx, 'run-1', 'deploy', {})).toBeNull()
    expect(await refusePlatformCall(ctx, 'run-1', 'update_task', { taskId: 't' })).toBeNull()
    expect(rows()).toEqual([
      expect.objectContaining({ toolName: 'deploy', blocked: false }),
      expect.objectContaining({ toolName: 'update_task', blocked: false }),
    ])
  })

  it('serves a call the harness\'s gate allowed once, without deciding or recording it again', async () => {
    const ctx = turn()
    await decideToolCall(ctx, { toolName: 'update_task', input: { taskId: 't', title: 'x' } }, {})
    expect(await refusePlatformCall(ctx, 'run-1', 'update_task', { title: 'x', taskId: 't' })).toBeNull()
    expect(rows()).toHaveLength(1)
    expect(await refusePlatformCall(ctx, 'run-1', 'update_task', { title: 'x', taskId: 't' })).toBeNull()
    expect(rows()).toHaveLength(2)
  })

  it('refuses every call of a run that is stopped or has no turn running, and records it', async () => {
    stopGateRun('run-1')
    expect(await refusePlatformCall(null, 'run-1', 'update_task', {})).toBe(RUN_STOPPED_TEXT)
    expect(rows().at(-1)).toEqual(expect.objectContaining({ blocked: true, blockReason: 'run-stopped' }))
    expect(await refusePlatformCall(null, 'run-2', 'update_task', {})).toBe(NO_TURN_CALL_TEXT)
    expect(await refusePlatformCall(null, null, 'update_task', {})).toBe(NO_TURN_CALL_TEXT)
  })

  it('pauses a pausing run at a call sent to /mcp', async () => {
    const reached = vi.fn()
    pauseGateRun('run-1', reached)
    expect(await refusePlatformCall(turn(), 'run-1', 'update_task', {})).toBe(RUN_PAUSED_TEXT)
    expect(reached).toHaveBeenCalled()
  })
})
