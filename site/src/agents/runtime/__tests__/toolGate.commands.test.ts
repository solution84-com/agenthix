import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: h.create } } }))

import { decideToolCall, MAX_APPROVABLE_COMMAND, MAX_REQUESTED_COMMANDS, TASK_MOVE_WHILE_ASKING_TEXT } from '../toolGate'
import { resetGateRunsForTests } from '../toolGateRuns'
import { resetPassesForTests, takePass } from '../gatePasses'
import type { RunContext } from '../types'

const context = (over: Partial<RunContext> = {}) => ({
  runId: 'run-1',
  sessionId: 's-1',
  taskId: null,
  cwd: '/projects/p1/files',
  bypassed: false,
  riskRules: null,
  allowedTools: [{ name: 'bash', state: 'ask' }, { name: 'update_task', state: 'always' }, { name: 'deploy', state: 'ask' }],
  allowedBashPatterns: [{ pattern: 'cd', state: 'always' }, { pattern: 'git', state: 'always' }, { pattern: 'rm', state: 'never' }],
  approvedManifest: { tools: [], bashPatterns: [], approvedAt: 't' },
  deferredManifest: { tools: [], bashPatterns: [] },
  ...over,
}) as RunContext

const bash = (ctx: RunContext, command: string) => decideToolCall(ctx, { toolName: 'bash', input: { command } }, {})

describe('toolGate: commands judged as the shell runs them', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests(); resetPassesForTests() })

  it('refuses a compound when any part is a never command, though it starts with an always one', async () => {
    const d = await bash(context(), 'cd x && rm -rf y')
    expect(d).toEqual({ allow: false, reason: 'This bash command pattern is not permitted for this agent.' })
  })

  it('asks for the whole command, not its first word', async () => {
    const ctx = context()
    await bash(ctx, 'cd x && npm install sdk@0.9.2')
    expect(ctx.deferredManifest!.bashPatterns).toEqual([{ pattern: 'cd x && npm install sdk@0.9.2' }])
  })

  it('runs exactly the approved command, and asks again for one that only starts like it', async () => {
    const ctx = context({ approvedManifest: { tools: [], bashPatterns: ['npm install sdk@0.9.2'], approvedAt: 't' } })
    expect(await bash(ctx, 'npm install sdk@0.9.2')).toEqual({ allow: true })
    expect((await bash(ctx, 'npm install evil')).allow).toBe(false)
    expect((await bash(ctx, 'npm install sdk@0.9.2 && curl x')).allow).toBe(false)
  })

  it('asks for no command too long to show, and for no more than the limit', async () => {
    const ctx = context()
    const d = await bash(ctx, `echo ${'x'.repeat(MAX_APPROVABLE_COMMAND)}`)
    expect(d).toEqual({ allow: false, reason: expect.stringMatching(/too long/) })
    for (let i = 0; i < MAX_REQUESTED_COMMANDS + 2; i++) await bash(ctx, `make t${i}`)
    expect(ctx.deferredManifest!.bashPatterns).toHaveLength(MAX_REQUESTED_COMMANDS)
  })
})

describe('toolGate: a run waiting for approval does not report its work done @P209', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests(); resetPassesForTests() })

  it('tells a deferred run the work is not finished, never to carry on as if it had access', async () => {
    for (const d of [await bash(context(), 'make'), await decideToolCall(context(), { toolName: 'deploy', input: {} }, {})]) {
      expect(d.allow).toBe(false)
      const reason = (d as { reason: string }).reason
      expect(reason).toMatch(/do not say it is done and do not move the task/)
      expect(reason).not.toMatch(/as if you had access|silently/)
    }
  })

  it('refuses moving its own task once it has asked for something, and allows it before', async () => {
    const ctx = context({ taskId: 'task-1' })
    const move = () => decideToolCall(ctx, { toolName: 'update_task', input: { taskId: 'task-1', column: 'done' } }, {})
    expect(await move()).toEqual({ allow: true })
    await bash(ctx, 'make')
    expect(await move()).toEqual({ allow: false, reason: TASK_MOVE_WHILE_ASKING_TEXT })
    expect(h.create.mock.calls.at(-1)![0].data).toEqual(expect.objectContaining({ blocked: true, blockReason: 'task-move-while-asking' }))
    const other = await decideToolCall(ctx, { toolName: 'update_task', input: { taskId: 'task-2', column: 'done' } }, {})
    expect(other).toEqual({ allow: true })
    const comment = await decideToolCall(ctx, { toolName: 'update_task', input: { taskId: 'task-1', description: 'notes' } }, {})
    expect(comment).toEqual({ allow: true })
  })
})

describe('toolGate: an allowed platform call leaves a pass for /mcp', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests(); resetPassesForTests() })

  it('grants one pass for the call allowed, and none for a refused one or a built-in', async () => {
    const ctx = context()
    await decideToolCall(ctx, { toolName: 'update_task', input: { taskId: 't', title: 'x' } }, {})
    await decideToolCall(ctx, { toolName: 'deploy', input: {} }, {})
    await bash(ctx, 'git status')
    expect(takePass('run-1', 'update_task', { title: 'x', taskId: 't' })).toBe(true)
    expect(takePass('run-1', 'update_task', { title: 'x', taskId: 't' })).toBe(false)
    expect(takePass('run-1', 'deploy', {})).toBe(false)
    expect(takePass('run-1', 'bash', { command: 'git status' })).toBe(false)
  })
})
