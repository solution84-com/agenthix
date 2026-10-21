import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: h.create } } }))

import { decideToolCall } from '../toolGate'
import { containerHarnessPathPolicy } from '../harnessPathRule'
import { resetGateRunsForTests } from '../toolGateRuns'
import type { RunContext, ToolPermissionState } from '../types'

/**
 * A command no pattern matches follows "Any other command" — the Bash tool's own state: Always runs it, Ask asks
 * (deferred or immediate as the approval says), Never refuses. A matching pattern still decides for the commands
 * it matches.
 */
const harnessPaths = containerHarnessPathPolicy('c1', '/projects/p1/files', [], async p => p)

const context = (bash: ToolPermissionState, over: Partial<RunContext> = {}) => ({
  runId: 'run-1',
  sessionId: 's-1',
  cwd: '/projects/p1/files',
  bypassed: false,
  riskRules: null,
  allowedTools: [{ name: 'bash', state: bash }],
  allowedBashPatterns: [{ pattern: 'git', state: 'always' }, { pattern: 'npm', state: 'ask' }, { pattern: 'rm', state: 'never' }],
  approvedManifest: { tools: [], bashPatterns: [], approvedAt: 't' },
  deferredManifest: { tools: [], bashPatterns: [] },
  ...over,
}) as RunContext

const bash = (ctx: RunContext, command: string) => decideToolCall(ctx, { toolName: 'bash', input: { command } }, { harnessPaths })
const rows = () => h.create.mock.calls.map(c => c[0].data)

describe('toolGate — a command matching no pattern follows Any other command @SC-768', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests() })

  it('runs it when Bash is Always', async () => {
    const ctx = context('always')
    expect(await bash(ctx, 'make build')).toEqual({ allow: true })
    expect(ctx.deferredManifest!.bashPatterns).toEqual([])
  })

  it('asks when Bash is Ask: a deferred run records it and carries on', async () => {
    const ctx = context('ask')
    const d = await bash(ctx, 'make build')
    expect(d.allow).toBe(false)
    expect(ctx.deferredManifest!.bashPatterns).toEqual([{ pattern: 'make', reason: 'make build' }])
    expect(rows()).toEqual([expect.objectContaining({ blocked: true, blockReason: 'bash-not-in-manifest' })])
  })

  it('asks when Bash is Ask: an immediate run stops at it', async () => {
    const ctx = context('ask', { immediateApproval: true })
    const d = await bash(ctx, 'make build')
    expect(d).toEqual({ allow: false, reason: expect.stringMatching(/then end your turn/) })
  })

  it('runs it when Bash is Ask and the run has already approved it', async () => {
    const ctx = context('ask', { approvedManifest: { tools: [], bashPatterns: ['make'], approvedAt: 't' } })
    expect(await bash(ctx, 'make build')).toEqual({ allow: true })
  })

  it('refuses it when Bash is Never', async () => {
    expect(await bash(context('never'), 'make build')).toEqual({ allow: false, reason: 'Bash is not available for this agent.' })
  })

  it('runs it unattended when Bash is Always, and refuses it unattended when Bash is Ask', async () => {
    expect(await bash(context('always', { approvedManifest: undefined, deferredManifest: undefined }), 'make')).toEqual({ allow: true })
    const asked = await bash(context('ask', { approvedManifest: undefined, deferredManifest: undefined }), 'make')
    expect(asked.allow).toBe(false)
    expect(rows().at(-1)).toEqual(expect.objectContaining({ blocked: true, blockReason: 'bash-ask-unattended' }))
  })
})

describe('toolGate — a matching pattern still wins over Any other command @SC-768', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests() })

  it('runs a command an Always pattern matches while Bash is Ask', async () => {
    const ctx = context('ask')
    expect(await bash(ctx, 'git status')).toEqual({ allow: true })
    expect(ctx.deferredManifest!.bashPatterns).toEqual([])
  })

  it('asks about a command an Ask pattern matches while Bash is Always', async () => {
    const ctx = context('always')
    expect((await bash(ctx, 'npm install')).allow).toBe(false)
    expect(ctx.deferredManifest!.bashPatterns).toEqual([{ pattern: 'npm', reason: 'npm install' }])
  })

  it('refuses a command a Never pattern matches while Bash is Always', async () => {
    expect(await bash(context('always'), 'rm -rf x')).toEqual({ allow: false, reason: 'This bash command pattern is not permitted for this agent.' })
  })
})
