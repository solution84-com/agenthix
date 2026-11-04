/**
 * Pins the Claude gate's decisions, steering text and audit rows, so moving
 * its logic into the runtime-neutral toolGate.ts cannot change them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HookInput } from '@anthropic-ai/claude-agent-sdk'

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: h.create } } }))

import { buildPreToolUseHook } from '../sdkToolGate'
import { RUN_STOPPED_TEXT } from '../toolGate'
import { resetGateRunsForTests, stopGateRun } from '../toolGateRuns'
import type { RunContext, DeferredManifest } from '../types'

function ctx(over: Partial<RunContext> = {}): RunContext {
  return {
    runId: 'run-1',
    sessionId: 'session-1',
    taskId: null,
    projectId: null,
    model: 'm',
    prompt: 'p',
    cwd: '/projects/p1/files',
    agent: { id: 'a', handle: 'coder', name: 'Coder', systemPrompt: null, defaultModel: 'm' },
    credential: null,
    riskRules: null,
    packages: { refs: { agent: null, org: null, platform: null }, agentDir: null, orgDir: null, platformDir: null } as unknown as RunContext['packages'],
    boundaryOverride: null,
    skills: null,
    claudeHome: { serverDir: '/site/homes/x/.claude', visibleDir: '/site/homes/x/.claude' },
    runStaging: { serverDir: '/site/run-staging/x', visibleDir: '/site/run-staging/x' },
    workingTreeDir: '/projects/p1/files',
    ...over,
  }
}

function manifestCtx(over: Partial<RunContext> = {}, deferred: DeferredManifest | null = { tools: [], bashPatterns: [] }): RunContext {
  return ctx({
    approvedManifest: { tools: ['read_file'], bashPatterns: ['git status'], approvedAt: 't' },
    deferredManifest: deferred ?? undefined,
    allowedTools: [
      { name: 'read_file', state: 'ask' },
      { name: 'write_file', state: 'ask' },
      { name: 'web_fetch', state: 'never' },
      { name: 'glob_files', state: 'always' },
      { name: 'bash', state: 'ask' },
    ],
    ...over,
  })
}

const call = (context: RunContext, tool_name: string, tool_input: unknown, skillNames: string[] = []) =>
  buildPreToolUseHook(context, { skillNames })({ tool_name, tool_input, hook_event_name: 'PreToolUse', tool_use_id: 'tu-1' } as unknown as HookInput)

const rows = () => h.create.mock.calls.map(c => c[0].data)

describe('sdkToolGate — the Claude adapter, pinned', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}); resetGateRunsForTests() })

  it('blocks an MCP tool from a server other than the platform, without an audit row', async () => {
    expect(await call(ctx(), 'mcp__atlassian__search', {})).toEqual({
      decision: 'block',
      reason: 'External MCP tool mcp__atlassian__search is not available. Only Agenthix platform tools are permitted.',
    })
    expect(h.create).not.toHaveBeenCalled()
  })

  it.each(['ToolSearch', 'TaskOutput', 'TaskStop'])('blocks the SDK meta-tool %s and records it', async (tool) => {
    expect(await call(ctx({ bypassed: true }), tool, { a: 1 })).toEqual({
      decision: 'block',
      reason: `${tool} is not available in Agenthix agent runs. Use the platform MCP tools (e.g. create_task) to manage tasks.`,
    })
    expect(rows()).toEqual([expect.objectContaining({ runId: 'run-1', toolName: tool, toolInput: { a: 1 }, riskLevel: 'FLAGGED', blocked: true, blockReason: 'sdk-meta-tool-blocked' })])
  })

  it.each(['TodoWrite', 'TodoRead'])('allows the harness\'s own to-do list, %s, whatever the permissions, and records it', async (tool) => {
    const strict = manifestCtx({ immediateApproval: true, allowedTools: [{ name: tool, state: 'never' }] })
    expect(await call(strict, tool, { todos: [] })).toEqual({})
    expect(rows()).toEqual([expect.objectContaining({ toolName: tool, toolUseId: 'tu-1', blocked: false })])
  })

  describe('Skill', () => {
    const staged = ['agent-hello', 'org-review']

    it('loads a staged skill whatever the permissions, in a strict, deferred or unattended run, and records it as skill', async () => {
      const strict = manifestCtx({ immediateApproval: true, allowedTools: [{ name: 'read_file', state: 'ask' }] })
      const unattended = ctx({ allowedTools: [{ name: 'read_file', state: 'ask' }] })
      expect(await call(strict, 'Skill', { skill: 'agent-hello' }, staged)).toEqual({})
      expect(await call(unattended, 'Skill', { skill: 'org-review' }, staged)).toEqual({})
      expect(strict.deferredManifest?.tools).toEqual([])
      expect(rows()).toEqual([
        expect.objectContaining({ toolName: 'skill', toolInput: { skill: 'agent-hello' }, blocked: false }),
        expect.objectContaining({ toolName: 'skill', toolInput: { skill: 'org-review' }, blocked: false }),
      ])
    })

    it('accepts the forms Claude Code accepts: a leading slash and the plugin prefix', async () => {
      expect(await call(ctx({ bypassed: true }), 'Skill', { skill: '/agent-hello' }, staged)).toEqual({})
      expect(await call(ctx({ bypassed: true }), 'Skill', { skill: 'agenthix:org-review' }, staged)).toEqual({})
    })

    it('refuses a name the run did not stage, for a bypassed agent too, and records it', async () => {
      for (const skill of ['update-config', 'other:agent-hello', '', 'agent-hello/../x']) {
        expect(await call(ctx({ bypassed: true }), 'Skill', { skill }, staged)).toEqual({
          decision: 'block', reason: `There is no skill named "${skill}" in this run. Use only the skills listed for it.`,
        })
      }
      expect(await call(ctx({ bypassed: true }), 'Skill', { skill: 'agent-hello' })).toMatchObject({ decision: 'block' })
      expect(rows()).toHaveLength(5)
      expect(rows().every(r => r.toolName === 'skill' && r.blocked && r.blockReason === 'skill-not-staged')).toBe(true)
    })

    it('is refused once the run is stopped', async () => {
      stopGateRun('run-1')
      expect(await call(ctx({ bypassed: true }), 'Skill', { skill: 'agent-hello' }, staged)).toEqual({ decision: 'block', reason: RUN_STOPPED_TEXT })
    })
  })

  it('refuses the to-do list once the run is stopped', async () => {
    stopGateRun('run-1')
    expect(await call(ctx({ bypassed: true }), 'TodoWrite', { todos: [] })).toEqual({ decision: 'block', reason: RUN_STOPPED_TEXT })
  })

  it('audits an allowed call under its canonical name, rated by the bash rules', async () => {
    expect(await call(ctx({ bypassed: true }), 'Bash', { command: 'rm -rf /tmp/x' })).toEqual({})
    expect(await call(ctx({ bypassed: true }), 'mcp__platform__create_task', { title: 't' })).toEqual({})
    expect(rows()).toEqual([
      expect.objectContaining({ toolName: 'bash', riskLevel: 'FLAGGED', blocked: false }),
      expect.objectContaining({ toolName: 'create_task', riskLevel: 'LOW', blocked: false }),
    ])
  })

  describe('bash', () => {
    it('blocks bash in the never state, and records it', async () => {
      const c = manifestCtx({ allowedTools: [{ name: 'bash', state: 'never' }] })
      expect(await call(c, 'Bash', { command: 'ls' })).toEqual({ decision: 'block', reason: 'Bash is not available for this agent.' })
      expect(rows()).toEqual([expect.objectContaining({ toolName: 'bash', riskLevel: 'FLAGGED', blocked: true, blockReason: 'tool-never' })])
    })

    it('blocks a pattern in the never state, and records it', async () => {
      const c = manifestCtx({ allowedTools: [{ name: 'bash', state: 'always' }], allowedBashPatterns: [{ pattern: 'rm', state: 'never' }] })
      expect(await call(c, 'Bash', { command: 'rm -rf x' })).toEqual({ decision: 'block', reason: 'This bash command pattern is not permitted for this agent.' })
      expect(rows()).toEqual([expect.objectContaining({ riskLevel: 'FLAGGED', blocked: true, blockReason: 'bash-pattern-never' })])
    })

    it('blocks a never-state pattern with bash in the ask state, even when the manifest approves the command', async () => {
      const c = manifestCtx({
        allowedTools: [{ name: 'bash', state: 'ask' }],
        allowedBashPatterns: [{ pattern: 'rm', state: 'never' }],
        approvedManifest: { tools: [], bashPatterns: ['rm -rf x', 'ls'], approvedAt: 't' },
      })
      expect(await call(c, 'Bash', { command: 'rm -rf x' })).toEqual({ decision: 'block', reason: 'This bash command pattern is not permitted for this agent.' })
      expect(rows()).toEqual([expect.objectContaining({ riskLevel: 'FLAGGED', blocked: true, blockReason: 'bash-pattern-never' })])
      expect(await call(c, 'Bash', { command: 'ls' })).toEqual({})
    })

    it('allows an always-state pattern without consulting the manifest', async () => {
      const c = manifestCtx({ allowedTools: [{ name: 'bash', state: 'always' }], allowedBashPatterns: [{ pattern: 'npm', state: 'always' }] })
      expect(await call(c, 'Bash', { command: 'npm test' })).toEqual({})
      expect(rows()).toEqual([expect.objectContaining({ blocked: false })])
    })

    it('allows exactly the command the manifest approved, and neither a longer one nor *', async () => {
      expect(await call(manifestCtx(), 'Bash', { command: 'git status' })).toEqual({})
      expect(await call(manifestCtx(), 'Bash', { command: 'git status --short' })).toEqual(expect.objectContaining({ decision: 'block' }))
      const star = manifestCtx({ approvedManifest: { tools: [], bashPatterns: ['*'], approvedAt: 't' } })
      expect(await call(star, 'Bash', { command: 'anything' })).toEqual(expect.objectContaining({ decision: 'block' }))
    })

    it('defers an unapproved command, collecting each whole command once', async () => {
      const deferred: DeferredManifest = { tools: [], bashPatterns: [] }
      const c = manifestCtx({}, deferred)
      const r = await call(c, 'Bash', { command: 'make build' })
      await call(c, 'Bash', { command: 'make test' })
      await call(c, 'Bash', { command: 'make test' })
      expect(r).toEqual({ decision: 'block', reason: expect.stringMatching(/^This command was not run: it needs a person's approval/) })
      expect(deferred.bashPatterns).toEqual([{ pattern: 'make build' }, { pattern: 'make test' }])
      expect(rows()[0]).toEqual(expect.objectContaining({ riskLevel: 'FLAGGED', blocked: true, blockReason: 'bash-not-in-manifest' }))
    })

    it('stops a strict run at an unapproved command', async () => {
      const r = await call(manifestCtx({ immediateApproval: true }), 'Bash', { command: 'make' })
      expect(r).toEqual({ decision: 'block', reason: 'This command is not approved for this run. Explain what you were trying to do and why you need to run it, then end your turn.' })
    })

    it('blocks an unapproved command outright when nothing collects deferrals', async () => {
      const r = await call(manifestCtx({}, null), 'Bash', { command: 'make' })
      expect(r).toEqual({ decision: 'block', reason: 'Bash command does not match any approved pattern for this run.' })
    })

    it('is not enforced for a bypassed agent', async () => {
      expect(await call(manifestCtx({ bypassed: true }), 'Bash', { command: 'make' })).toEqual({})
    })

    it('blocks an ask command without a manifest, with nobody to approve it, and records it', async () => {
      expect(await call(ctx({ allowedTools: [{ name: 'bash', state: 'ask' }] }), 'Bash', { command: 'make' })).toEqual({ decision: 'block', reason: 'This bash command needs a person\'s approval, and this is a scheduled run with nobody to approve it, so it cannot run here. Carry on without it.' })
      expect(rows()).toEqual([expect.objectContaining({ toolName: 'bash', blocked: true, blockReason: 'bash-ask-unattended' })])
    })
  })

  describe('other tools', () => {
    it('blocks a never-state tool, and records it', async () => {
      expect(await call(manifestCtx(), 'WebFetch', { url: 'https://x' })).toEqual({ decision: 'block', reason: 'web_fetch is not available for this agent.' })
      expect(rows()).toEqual([expect.objectContaining({ toolName: 'web_fetch', riskLevel: 'FLAGGED', blocked: true, blockReason: 'tool-never' })])
    })

    it('blocks a never-state tool and a never-state pattern without a manifest too', async () => {
      const c = ctx({ allowedTools: [{ name: 'web_fetch', state: 'never' }, { name: 'bash', state: 'always' }], allowedBashPatterns: [{ pattern: 'rm', state: 'never' }] })
      expect(await call(c, 'WebFetch', { url: 'https://x' })).toEqual({ decision: 'block', reason: 'web_fetch is not available for this agent.' })
      expect(await call(c, 'Bash', { command: 'rm -rf x' })).toEqual({ decision: 'block', reason: 'This bash command pattern is not permitted for this agent.' })
      // A command no pattern matches follows bash's own state: Always runs it, Ask has nobody to ask here.
      expect(await call(c, 'Bash', { command: 'ls' })).toEqual({})
      const asks = ctx({ allowedTools: [{ name: 'bash', state: 'ask' }], allowedBashPatterns: [{ pattern: 'rm', state: 'never' }] })
      expect(await call(asks, 'Bash', { command: 'ls' })).toEqual({ decision: 'block', reason: 'This bash command needs a person\'s approval, and this is a scheduled run with nobody to approve it, so it cannot run here. Carry on without it.' })
    })

    it('blocks an ask-state tool without a manifest, and allows an always-state one', async () => {
      const c = ctx({ allowedTools: [{ name: 'read_file', state: 'ask' }, { name: 'glob_files', state: 'always' }] })
      expect(await call(c, 'Read', { file_path: '/projects/p1/files/a.ts' })).toEqual({
        decision: 'block',
        reason: 'read_file needs a person\'s approval, and this is a scheduled run with nobody to approve it, so it is not available here. Carry on without it.',
      })
      expect(await call(c, 'Glob', { pattern: '*.ts' })).toEqual({})
      expect(rows()[0]).toEqual(expect.objectContaining({ toolName: 'read_file', blocked: true, blockReason: 'tool-ask-unattended' }))
    })

    it('allows an always-state tool and an ask-state tool the manifest holds', async () => {
      expect(await call(manifestCtx(), 'Glob', { pattern: '*.ts' })).toEqual({})
      expect(await call(manifestCtx(), 'Read', { file_path: '/projects/p1/files/a.ts' })).toEqual({})
      expect(rows()).toEqual([
        expect.objectContaining({ toolName: 'glob_files', riskLevel: 'SAFE', blocked: false }),
        expect.objectContaining({ toolName: 'read_file', riskLevel: 'SAFE', blocked: false }),
      ])
    })

    it('defers an ask-state tool the manifest lacks, merging targets', async () => {
      const deferred: DeferredManifest = { tools: [], bashPatterns: [] }
      const c = manifestCtx({}, deferred)
      const r = await call(c, 'Write', { file_path: '/projects/p1/files/a.ts' })
      await call(c, 'Write', { file_path: '/projects/p1/files/b.ts' })
      await call(c, 'Write', { file_path: '/projects/p1/files/b.ts' })
      expect(r).toEqual({ decision: 'block', reason: expect.stringMatching(/^write_file was not run: it needs a person's approval/) })
      expect(deferred.tools).toEqual([{ name: 'write_file', reason: 'a.ts, b.ts' }])
      expect(rows()[0]).toEqual(expect.objectContaining({ riskLevel: 'LOW', blocked: true, blockReason: 'tool-deferred' }))
    })

    it('treats a tool missing from the permissions as ask, and stops a strict run', async () => {
      const r = await call(manifestCtx({ immediateApproval: true }), 'mcp__platform__create_task', {})
      expect(r).toEqual({ decision: 'block', reason: 'create_task is not available in this run. This action requires approval before it can proceed. Explain what you were trying to do and why you need access to create_task, then end your turn. The user will review and approve or reject before the run continues.' })
    })

    it('skips the manifest check without a deferred-manifest collector', async () => {
      expect(await call(manifestCtx({}, null), 'Write', { file_path: 'a.ts' })).toEqual({})
    })

    it('applies the site risk rules to bash commands, and not to a platform tool', async () => {
      const riskRules = [{ pattern: 'create_task', riskLevel: 'HIGH' as const }, { pattern: 'make', riskLevel: 'HIGH' as const }]
      await call(ctx({ bypassed: true, riskRules }), 'mcp__platform__create_task', {})
      await call(ctx({ bypassed: true, riskRules }), 'Bash', { command: 'make build' })
      expect(rows().map(r => r.riskLevel)).toEqual(['LOW', 'HIGH'])
    })
  })
})

describe('sdkToolGate — Claude file tools and the harness home', () => {
  beforeEach(() => { h.create.mockReset(); h.create.mockResolvedValue({}) })

  const skillsDir = '/home/appuser/.claude/.tmp/skills-abc'
  const container = ctx({
    bypassed: true,
    containerName: 'agent-c1',
    cwd: '/projects/p1/files',
    claudeHome: { serverDir: '/site/homes/x/.claude', visibleDir: '/home/appuser/.claude' },
  })
  const resolveRealPath = vi.fn(async (p: string) => (p === '/projects/p1/files/planted' ? '/home/appuser/.claude/.credentials.json' : p))
  const hook = (c: RunContext = container) => buildPreToolUseHook(c, { skillsDir, resolveRealPath })
  const ask = (tool_name: string, tool_input: unknown, c?: RunContext) =>
    hook(c)({ tool_name, tool_input, hook_event_name: 'PreToolUse', tool_use_id: 'tu-7' } as unknown as HookInput)

  it.each([
    ['Read', { file_path: '/home/appuser/.claude.json' }],
    ['Read', { file_path: '/proc/self/environ' }],
    ['Read', { file_path: 'planted' }],
    ['Edit', { file_path: '/home/appuser/.claude/settings.json', old_string: 'a', new_string: 'b' }],
    ['Write', { file_path: `${skillsDir}/.claude/skills/x/SKILL.md`, content: 'x' }],
    ['Glob', { pattern: '/home/appuser/**' }],
    ['Grep', { pattern: 'KEY', path: '/proc' }],
    ['Grep', { pattern: 'KEY', path: '/' }],
  ])('refuses %s %j', async (tool, input) => {
    const r = await ask(tool, input)
    expect(r).toEqual({ decision: 'block', reason: expect.stringContaining('the harness\'s own files and /proc are not available') })
    expect(rows()[0]).toEqual(expect.objectContaining({ toolUseId: 'tu-7', blocked: true, blockReason: 'harness-path-protected' }))
  })

  it('hands Claude the checked real path of a file tool through updatedInput, and nothing else', async () => {
    const linked = vi.fn(async (p: string) => (p === '/projects/p1/files/link' ? '/projects/p1/files/src/real.ts' : p === '/projects/p1/files/d' ? '/projects/p1/files/src' : p))
    const ask2 = (tool_name: string, tool_input: unknown) =>
      buildPreToolUseHook(container, { skillsDir, resolveRealPath: linked })({ tool_name, tool_input, hook_event_name: 'PreToolUse', tool_use_id: 'tu-8' } as unknown as HookInput)
    const allowWith = (updatedInput: unknown) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput } })
    expect(await ask2('Edit', { file_path: 'link', old_string: 'a', new_string: 'b' }))
      .toEqual(allowWith({ file_path: '/projects/p1/files/src/real.ts', old_string: 'a', new_string: 'b' }))
    expect(await ask2('Grep', { pattern: 'x', path: 'd' })).toEqual(allowWith({ pattern: 'x', path: '/projects/p1/files/src' }))
    expect(await ask2('Glob', { pattern: '**/*.ts', path: 'd' })).toEqual(allowWith({ pattern: '**/*.ts', path: '/projects/p1/files/src' }))
    expect(await ask2('Read', { file_path: '/projects/p1/files/a.ts' })).toEqual({})
    expect(await ask2('Glob', { pattern: 'd/**/*.ts' })).toEqual({})
  })

  it('lets Read into the run\'s staged skills and this session\'s saved tool results', async () => {
    expect(await ask('Read', { file_path: `${skillsDir}/.claude/skills/x/references/a.md` })).toEqual({})
    const results = '/home/appuser/.claude/projects/-projects-p1-files/session-1/tool-results/b1.txt'
    expect(await ask('Read', { file_path: results })).toEqual({})
    const other = '/home/appuser/.claude/projects/-projects-p1-files/session-2/tool-results/b1.txt'
    expect((await ask('Read', { file_path: other })).decision).toBe('block')
  })

  it('checks a search with no path against the working directory, and passes project paths', async () => {
    expect(await ask('Grep', { pattern: 'x' })).toEqual({})
    expect(await ask('Glob', { pattern: 'src/**/*.ts' })).toEqual({})
    expect(resolveRealPath).toHaveBeenCalledWith('/projects/p1/files')
    expect(await ask('Bash', { command: 'cat /home/appuser/.claude.json' })).toEqual({})
  })

  it('protects the runner home and the Claude config folder when the harness runs on this machine', async () => {
    const local = ctx({ bypassed: true, claudeHome: { serverDir: '/site/homes/x/.claude', visibleDir: '/site/homes/x/.claude' } })
    process.env.CLAUDE_CONFIG_DIR = '/Users/dev/.claude'
    try {
      expect((await ask('Read', { file_path: '/site/homes/x/.claude/.credentials.json' }, local)).decision).toBe('block')
      expect((await ask('Read', { file_path: '/Users/dev/.claude/settings.json' }, local)).decision).toBe('block')
      expect(await ask('Read', { file_path: '/projects/p1/files/a.ts' }, local)).toEqual({})
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR
    }
  })
})
