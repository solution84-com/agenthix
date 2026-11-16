/**
 * A tool reached through use_tool is gated as its native call (ADR-0193): Never refuses it, Ask defers it into the
 * run's request with the agent's reason and waits for the person exactly as a native Ask call does, and every row is
 * recorded under the tool's own name. The harness's gate decides it once, and /mcp serves it on that pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: h.create } } }))

import { refusePlatformCall } from '../mcpCallGate'
import { decideToolCall } from '../../../agents/runtime/toolGate'
import { resetGateRunsForTests } from '../../../agents/runtime/toolGateRuns'
import { resetPassesForTests } from '../../../agents/runtime/gatePasses'
import type { RunContext } from '../../../agents/runtime/types'

const turn = (over: Partial<RunContext> = {}) => ({
  runId: 'run-1', sessionId: 's1', taskId: null, cwd: '/w', bypassed: false, riskRules: null,
  allowedTools: [
    { name: 'use_tool', state: 'always' }, { name: 'find_tools', state: 'always' },
    { name: 'create_milestone', state: 'always' }, { name: 'run_workflow', state: 'ask' }, { name: 'delete_task', state: 'never' },
  ],
  allowedBashPatterns: [],
  approvedManifest: { tools: [], bashPatterns: [], approvedAt: 't' },
  deferredManifest: { tools: [], bashPatterns: [] },
  ...over,
}) as RunContext
const rows = () => h.create.mock.calls.map(c => c[0].data)
const use = (name: string, input: unknown, reason?: string) => ({ name, input, ...(reason ? { reason } : {}) })

describe('a call through use_tool is gated as the tool it names @SC-2181', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests(); resetPassesForTests() })

  it('refuses a tool at Never, recorded under its own name', async () => {
    const refusal = await refusePlatformCall(turn(), 'run-1', 'use_tool', use('delete_task', { taskId: 'WEB-1' }))
    expect(refusal).toBe('delete_task is not available for this agent.')
    expect(rows()).toEqual([expect.objectContaining({ toolName: 'delete_task', toolInput: { taskId: 'WEB-1' }, blocked: true, blockReason: 'tool-never' })])
  })

  it('defers a tool at Ask into the run\'s request with the agent\'s reason, as a native Ask call waits', async () => {
    const ctx = turn()
    const refusal = await refusePlatformCall(ctx, 'run-1', 'use_tool', use('run_workflow', { name: 'deploy-staging' }, 'Mia asked to deploy main to staging'))
    expect(refusal).toMatch(/run_workflow was not run: it needs a person's approval, which they are asked for when this run ends/)
    expect(ctx.deferredManifest!.tools).toEqual([{ name: 'run_workflow', reason: 'Mia asked to deploy main to staging' }])
    expect(rows()).toEqual([expect.objectContaining({ toolName: 'run_workflow', blocked: true, blockReason: 'tool-deferred' })])
  })

  it('waits the same way in a run that stops for approval at once', async () => {
    const ctx = turn({ immediateApproval: true })
    const refusal = await refusePlatformCall(ctx, 'run-1', 'use_tool', use('run_workflow', { name: 'deploy-staging' }))
    expect(refusal).toMatch(/run_workflow is not available in this run. This action requires approval/)
    expect(ctx.deferredManifest!.tools).toEqual([{ name: 'run_workflow' }])
  })

  it('serves the Ask tool once the person approved it for the run', async () => {
    const ctx = turn({ approvedManifest: { tools: ['run_workflow'], bashPatterns: [], approvedAt: 't' } })
    expect(await refusePlatformCall(ctx, 'run-1', 'use_tool', use('run_workflow', { name: 'deploy-staging' }))).toBeNull()
    expect(rows()).toEqual([expect.objectContaining({ toolName: 'run_workflow', blocked: false })])
  })

  it('refuses an Ask tool in a run nobody can approve', async () => {
    const refusal = await refusePlatformCall(turn({ approvedManifest: undefined }), 'run-1', 'use_tool', use('run_workflow', { name: 'x' }))
    expect(refusal).toMatch(/scheduled run with nobody to approve it/)
  })

  it('serves on the pass the harness\'s gate granted for the inner call, deciding and recording it once', async () => {
    const ctx = turn()
    const called = use('create_milestone', JSON.stringify({ projectId: 'WEB', name: 'Beta' }))
    expect(await decideToolCall(ctx, { toolName: 'use_tool', input: called, toolUseId: 'call-1' }, {})).toEqual({ allow: true })
    expect(await refusePlatformCall(ctx, 'run-1', 'use_tool', called)).toBeNull()
    expect(rows()).toEqual([expect.objectContaining({ toolName: 'create_milestone', toolInput: { projectId: 'WEB', name: 'Beta' }, toolUseId: 'call-1', blocked: false })])
  })

  it('lets find_tools and a use_tool that names nothing through, to be answered by the server', async () => {
    expect(await refusePlatformCall(turn({ allowedTools: [] }), 'run-1', 'find_tools', { query: 'milestone' })).toBeNull()
    expect(await refusePlatformCall(turn({ allowedTools: [] }), 'run-1', 'use_tool', { input: {} })).toBeNull()
    expect(rows().map(r => r.toolName)).toEqual(['find_tools', 'use_tool'])
  })
})
