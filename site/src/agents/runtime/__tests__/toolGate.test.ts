import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: h.create } } }))

import { decideToolCall, RUN_STOPPED_TEXT } from '../toolGate'
import type { GateCall } from '../toolGate'
import { containerHarnessPathPolicy } from '../harnessPathRule'
import type { RealPathResolver } from '../harnessPathRule'
import { resetGateRunsForTests, stopGateRun } from '../toolGateRuns'
import type { RunContext } from '../types'

const context = (over: Partial<RunContext> = {}) => ({
  runId: 'run-1',
  sessionId: 's-1',
  cwd: '/projects/p1/files',
  bypassed: true,
  riskRules: null,
  ...over,
}) as RunContext

const identity: RealPathResolver = async p => p
const policy = (resolve: RealPathResolver = identity, readable: string[] = ['/home/appuser/.claude/.tmp/skills-1']) =>
  containerHarnessPathPolicy('c1', '/projects/p1/files', readable, resolve)
const decide = (call: GateCall, resolve?: RealPathResolver, over?: Partial<RunContext>) =>
  decideToolCall(context(over), call, { harnessPaths: policy(resolve) })
const rows = () => h.create.mock.calls.map(c => c[0].data)

describe('toolGate — the harness path rule', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests() })

  it.each([
    ['/home/appuser/.claude.json'],
    ['/home/appuser'],
    ['/proc/self/environ'],
    ['../../../home/appuser/.local/share/opencode/auth.json'],
    ['/projects/p1/files/../../../proc/1/environ'],
  ])('refuses %s as written, even for a bypassed agent', async (p) => {
    const d = await decide({ toolName: 'read_file', input: { file_path: p }, toolUseId: 'call-9', paths: [p] })
    expect(d).toEqual({ allow: false, reason: `read_file cannot reach ${p}: the harness's own files and /proc are not available to agent tools. Work with the project's files instead.` })
    expect(rows()).toEqual([expect.objectContaining({ toolName: 'read_file', toolUseId: 'call-9', blocked: true, riskLevel: 'FLAGGED', blockReason: 'harness-path-protected' })])
  })

  it('refuses a path whose real path leads into the home', async () => {
    const resolve: RealPathResolver = async p => (p === '/projects/p1/files/link' ? '/home/appuser/.claude/.credentials.json' : p)
    expect((await decide({ toolName: 'read_file', input: {}, paths: ['link'] }, resolve)).allow).toBe(false)
    expect(rows()[0].blockReason).toBe('harness-path-protected')
  })

  it('refuses a path it cannot resolve', async () => {
    const d = await decide({ toolName: 'write_file', input: {}, paths: ['/tmp/x'] }, async () => { throw new Error('exec failed') })
    expect(d).toEqual({ allow: false, reason: 'write_file could not check where /tmp/x leads, so the call was not run. Try again, or use a path inside the project.' })
    expect(rows()[0].blockReason).toBe('harness-path-unresolved')
  })

  it('lets read-only tools, and only those, into a readable folder inside the home', async () => {
    const skill = '/home/appuser/.claude/.tmp/skills-1/.claude/skills/x/SKILL.md'
    expect(await decide({ toolName: 'read_file', input: {}, paths: [skill] })).toEqual({ allow: true })
    expect(await decide({ toolName: 'grep_files', input: {}, paths: ['/home/appuser/.claude/.tmp/skills-1'] })).toEqual({ allow: true })
    expect((await decide({ toolName: 'edit_file', input: {}, paths: [skill] })).allow).toBe(false)
  })

  it('refuses a readable folder whose real path leaves it for elsewhere in the home', async () => {
    const resolve: RealPathResolver = async p => (p.endsWith('SKILL.md') ? '/home/appuser/.claude.json' : p)
    expect((await decide({ toolName: 'read_file', input: {}, paths: ['/home/appuser/.claude/.tmp/skills-1/SKILL.md'] }, resolve)).allow).toBe(false)
  })

  it('judges a glob by the folder before its first wildcard, and refuses one climbing after a wildcard', async () => {
    const resolve = vi.fn(identity)
    expect(await decide({ toolName: 'glob_files', input: {}, paths: ['/projects/p1/files/**/*.ts'] }, resolve)).toEqual({ allow: true })
    expect(resolve).toHaveBeenCalledWith('/projects/p1/files')
    expect((await decide({ toolName: 'glob_files', input: {}, paths: ['/home/*/.claude.json'] })).allow).toBe(false)
    expect((await decide({ toolName: 'grep_files', input: {}, paths: ['/'] })).allow).toBe(false)
    expect((await decide({ toolName: 'read_file', input: {}, paths: ['/home'] })).allow).toBe(true)
    const climbing = await decide({ toolName: 'glob_files', input: {}, paths: ['src/**/../../../../home/appuser/*'] })
    expect(climbing).toEqual({ allow: false, reason: 'glob_files cannot use the pattern src/**/../../../../home/appuser/*: a pattern may not climb with ".." after a wildcard. Start it from the folder you mean instead.' })
  })

  it('resolves each distinct path once, and allows paths in the project', async () => {
    const resolve = vi.fn(identity)
    expect(await decide({ toolName: 'glob_files', input: {}, paths: ['.', './**/*.md'] }, resolve)).toEqual({ allow: true })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(rows()).toEqual([expect.objectContaining({ blocked: false })])
  })

  it('hands back where each path really leads when that is not where it was written', async () => {
    const resolve: RealPathResolver = async p =>
      p === '/projects/p1/files/link' ? '/projects/p1/files/real' : p === '/projects/p1/files/dir' ? '/projects/p1/other' : p
    expect(await decide({ toolName: 'read_file', input: {}, paths: ['link'] }, resolve))
      .toEqual({ allow: true, realPaths: { link: '/projects/p1/files/real' } })
    expect(await decide({ toolName: 'glob_files', input: {}, paths: ['dir', 'dir/**/*.ts', 'src'] }, resolve))
      .toEqual({ allow: true, realPaths: { dir: '/projects/p1/other', 'dir/**/*.ts': '/projects/p1/other/**/*.ts' } })
    expect(await decide({ toolName: 'read_file', input: {}, paths: ['a.ts', '/projects/p1/files/b.ts'] }, resolve)).toEqual({ allow: true })
  })

  it('does not apply to a call that names no paths', async () => {
    const resolve = vi.fn(identity)
    expect(await decide({ toolName: 'bash', input: { command: 'cat /home/appuser/.claude.json' } }, resolve)).toEqual({ allow: true })
    expect(resolve).not.toHaveBeenCalled()
  })
})

describe('toolGate — failing closed and stopped runs', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests() })

  it('refuses when deciding throws', async () => {
    h.create.mockRejectedValueOnce(new Error('db down'))
    const d = await decide({ toolName: 'read_file', input: {} })
    expect(d).toEqual({ allow: false, reason: 'The call could not be checked, so it was not run. Try again.' })
    expect(rows()[1]).toEqual(expect.objectContaining({ blocked: true, blockReason: 'gate-error' }))
  })

  it('refuses every call of a stopped run, and records it', async () => {
    stopGateRun('run-1')
    expect(await decide({ toolName: 'read_file', input: {}, toolUseId: 'c1' })).toEqual({ allow: false, reason: RUN_STOPPED_TEXT })
    expect(rows()).toEqual([expect.objectContaining({ toolUseId: 'c1', blocked: true, blockReason: 'run-stopped' })])
    expect(await decide({ toolName: 'read_file', input: {} }, identity, { runId: 'run-2' })).toEqual({ allow: true })
  })

  it('answers a pending decision with a refusal the moment its run stops, and records the call as refused', async () => {
    let release!: (p: string) => void
    const slow: RealPathResolver = p => new Promise(r => { release = () => r(p) })
    const pending = decide({ toolName: 'read_file', input: {}, paths: ['a.ts'] }, slow)
    await vi.waitFor(() => expect(release).toBeDefined())
    stopGateRun('run-1')
    expect(await pending).toEqual({ allow: false, reason: RUN_STOPPED_TEXT })
    release('/projects/p1/files/a.ts')
    await vi.waitFor(() => expect(rows()).toEqual([expect.objectContaining({ blocked: true, blockReason: 'run-stopped' })]))
  })
})

describe('toolGate — never, in a run with no manifest @SC-768', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests() })

  const unattended: Partial<RunContext> = {
    bypassed: false,
    allowedTools: [
      { name: 'bash', state: 'always' },
      { name: 'read_file', state: 'always' },
      { name: 'edit_file', state: 'always' },
      { name: 'write_file', state: 'never' },
      { name: 'web_fetch', state: 'never' },
      { name: 'grep_files', state: 'ask' },
    ],
    allowedBashPatterns: [{ pattern: 'rm', state: 'never' }, { pattern: 'git', state: 'always' }],
  }
  const run = (call: GateCall, over: Partial<RunContext> = {}) => decide(call, identity, { ...unattended, ...over })

  it('refuses a never-state tool, and records it', async () => {
    expect(await run({ toolName: 'web_fetch', input: { url: 'https://x' }, toolUseId: 'c1' })).toEqual({ allow: false, reason: 'web_fetch is not available for this agent.' })
    expect(rows()).toEqual([expect.objectContaining({ toolName: 'web_fetch', toolUseId: 'c1', blocked: true, riskLevel: 'FLAGGED', blockReason: 'tool-never' })])
  })

  it('refuses a call that also needs a never-state tool', async () => {
    const d = await run({ toolName: 'edit_file', input: {}, paths: ['a.ts'], alsoRequires: ['write_file'] })
    expect(d).toEqual({ allow: false, reason: 'write_file is not available for this agent.' })
    expect(rows()[0]).toEqual(expect.objectContaining({ blocked: true, blockReason: 'tool-never' }))
  })

  it('refuses bash in the never state, and records it', async () => {
    const d = await run({ toolName: 'bash', input: { command: 'ls' } }, { allowedTools: [{ name: 'bash', state: 'never' }] })
    expect(d).toEqual({ allow: false, reason: 'Bash is not available for this agent.' })
    expect(rows()).toEqual([expect.objectContaining({ toolName: 'bash', blocked: true, riskLevel: 'FLAGGED', blockReason: 'tool-never' })])
  })

  it('refuses a never-state bash pattern, whether bash is always or ask', async () => {
    for (const state of ['always', 'ask'] as const) {
      const d = await run({ toolName: 'bash', input: { command: 'rm -rf x' } }, { allowedTools: [{ name: 'bash', state }] })
      expect(d).toEqual({ allow: false, reason: 'This bash command pattern is not permitted for this agent.' })
    }
    expect(rows()).toEqual([
      expect.objectContaining({ blocked: true, blockReason: 'bash-pattern-never' }),
      expect.objectContaining({ blocked: true, blockReason: 'bash-pattern-never' }),
    ])
  })

  it('still allows always-state tools and commands', async () => {
    expect(await run({ toolName: 'read_file', input: {}, paths: ['a.ts'] })).toEqual({ allow: true })
    expect(await run({ toolName: 'edit_file', input: {}, paths: ['a.ts'] })).toEqual({ allow: true })
    expect(await run({ toolName: 'bash', input: { command: 'git status' } })).toEqual({ allow: true })
    expect(rows().every(r => r.blocked === false)).toBe(true)
  })

  it('does not apply to a bypassed agent', async () => {
    expect(await run({ toolName: 'web_fetch', input: {} }, { bypassed: true, allowedTools: undefined })).toEqual({ allow: true })
    expect(await run({ toolName: 'bash', input: { command: 'rm -rf x' } }, { bypassed: true, allowedTools: undefined })).toEqual({ allow: true })
  })
})

describe('toolGate — a never bash pattern in a run with a manifest @SC-768', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests() })

  it('refuses it with bash in the ask state, even when the manifest approves the command', async () => {
    const over: Partial<RunContext> = {
      bypassed: false,
      allowedTools: [{ name: 'bash', state: 'ask' }],
      allowedBashPatterns: [{ pattern: 'rm', state: 'never' }],
      approvedManifest: { tools: [], bashPatterns: ['rm -rf x', 'make'], approvedAt: 't' },
      deferredManifest: { tools: [], bashPatterns: [] },
    }
    expect(await decide({ toolName: 'bash', input: { command: 'rm -rf x' } }, identity, over)).toEqual({ allow: false, reason: 'This bash command pattern is not permitted for this agent.' })
    expect(rows()).toEqual([expect.objectContaining({ blocked: true, blockReason: 'bash-pattern-never' })])
    expect(await decide({ toolName: 'bash', input: { command: 'make' } }, identity, over)).toEqual({ allow: true })
  })
})

describe('toolGate — ask, in a run with no manifest @SC-768', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests() })

  const unattended: Partial<RunContext> = {
    bypassed: false,
    allowedTools: [
      { name: 'bash', state: 'always' },
      { name: 'read_file', state: 'always' },
      { name: 'edit_file', state: 'always' },
      { name: 'write_file', state: 'ask' },
      { name: 'grep_files', state: 'ask' },
      { name: 'create_task', state: 'ask' },
      { name: 'fetch_my_queued_tasks', state: 'always' },
      { name: 'run_task', state: 'always' },
    ],
    allowedBashPatterns: [{ pattern: 'git', state: 'always' }, { pattern: 'npm', state: 'ask' }],
  }
  const run = (call: GateCall, over: Partial<RunContext> = {}) => decide(call, identity, { ...unattended, ...over })
  const toolText = (name: string) =>
    `${name} needs a person's approval, and this is a scheduled run with nobody to approve it, so it is not available here. Carry on without it.`
  const bashText = 'This bash command needs a person\'s approval, and this is a scheduled run with nobody to approve it, so it cannot run here. Carry on without it.'

  it('refuses an ask-state built-in and platform tool, and records each', async () => {
    expect(await run({ toolName: 'grep_files', input: {}, paths: ['.'], toolUseId: 'c1' })).toEqual({ allow: false, reason: toolText('grep_files') })
    expect(await run({ toolName: 'create_task', input: { title: 't' } })).toEqual({ allow: false, reason: toolText('create_task') })
    expect(rows()).toEqual([
      expect.objectContaining({ toolName: 'grep_files', toolUseId: 'c1', blocked: true, riskLevel: 'LOW', blockReason: 'tool-ask-unattended' }),
      expect.objectContaining({ toolName: 'create_task', blocked: true, riskLevel: 'LOW', blockReason: 'tool-ask-unattended' }),
    ])
  })

  it('refuses a tool missing from the agent\'s permissions, which reads as ask', async () => {
    expect(await run({ toolName: 'glob_files', input: {}, paths: ['.'] })).toEqual({ allow: false, reason: toolText('glob_files') })
  })

  it('refuses a call that also needs an ask-state tool', async () => {
    expect(await run({ toolName: 'edit_file', input: {}, paths: ['a.ts'], alsoRequires: ['write_file'] })).toEqual({ allow: false, reason: toolText('write_file') })
  })

  it('refuses an ask pattern, and a command no pattern matches while bash is ask, and records each', async () => {
    expect(await run({ toolName: 'bash', input: { command: 'ls' } }, { allowedTools: [{ name: 'bash', state: 'ask' }], allowedBashPatterns: [] })).toEqual({ allow: false, reason: bashText })
    expect(await run({ toolName: 'bash', input: { command: 'npm install' } })).toEqual({ allow: false, reason: bashText })
    expect(await run({ toolName: 'bash', input: { command: 'make' } }, { allowedTools: [{ name: 'bash', state: 'ask' }] })).toEqual({ allow: false, reason: bashText })
    expect(rows()).toHaveLength(3)
    expect(rows().every(r => r.blocked === true && r.riskLevel === 'FLAGGED' && r.blockReason === 'bash-ask-unattended')).toBe(true)
  })

  it('runs a command an always pattern matches, whether bash is always or ask', async () => {
    for (const state of ['always', 'ask'] as const) {
      expect(await run({ toolName: 'bash', input: { command: 'git status' } }, { allowedTools: [{ name: 'bash', state }] })).toEqual({ allow: true })
    }
  })

  it('still allows always-state tools, the run\'s own platform tools, and permission-free tools', async () => {
    expect(await run({ toolName: 'read_file', input: {}, paths: ['a.ts'] })).toEqual({ allow: true })
    expect(await run({ toolName: 'fetch_my_queued_tasks', input: {} })).toEqual({ allow: true })
    expect(await run({ toolName: 'run_task', input: { taskId: 't' } })).toEqual({ allow: true })
    expect(await run({ toolName: 'todowrite', input: {}, permissionFree: true })).toEqual({ allow: true })
    expect(rows().every(r => r.blocked === false)).toBe(true)
  })

  it('does not apply to a bypassed agent', async () => {
    expect(await run({ toolName: 'grep_files', input: {}, paths: ['.'] }, { bypassed: true, allowedTools: undefined })).toEqual({ allow: true })
    expect(await run({ toolName: 'bash', input: { command: 'make' } }, { bypassed: true, allowedTools: undefined })).toEqual({ allow: true })
  })

  it('does not apply to a run with a manifest: ask calls there are as before', async () => {
    const withManifest: Partial<RunContext> = { approvedManifest: { tools: [], bashPatterns: ['*'], approvedAt: 't' } }
    expect(await run({ toolName: 'grep_files', input: {}, paths: ['.'] }, withManifest)).toEqual({ allow: true })
    expect(await run({ toolName: 'bash', input: { command: 'make' } }, withManifest)).toEqual({ allow: true })
    expect(rows().every(r => r.blocked === false)).toBe(true)
  })
})
