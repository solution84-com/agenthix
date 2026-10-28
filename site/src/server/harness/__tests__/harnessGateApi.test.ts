/**
 * The site's end of the OpenCode plugin's gate call (5.11, 5.15): the turn
 * found from the conversation's token, OpenCode's tools decided by the shared
 * gate, and a stopped turn's pending and later decisions refused.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: h.create } } }))

import { HARNESS_GATE_UNAVAILABLE } from '@agenthix/core'
import type { HarnessGateRequest } from '@agenthix/core'
import { answerHarnessGate, harnessGateHandler, NO_TURN_TEXT } from '../harnessGateApi'
import { clearConversationTurn, pointConversationToken, revokeConversationToken } from '../../runtime/conversationTokens'
import { registerGateRun, resetGateRunsForTests, stopGateRun } from '../../../agents/runtime/toolGateRuns'
import { RUN_STOPPED_TEXT } from '../../../agents/runtime/toolGate'
import { openCodeConnectionName } from '../../../agents/runtime/opencode/openCodeConnection'
import { OPENCODE_TOOL_OUTPUT_DIR, setOpenCodeSkillsDir } from '../../../agents/runtime/opencode/openCodeGate'
import type { RealPathResolver } from '../../../agents/runtime/harnessPathRule'
import type { RunContext, DeferredManifest } from '../../../agents/runtime/types'

const CONV = 'conv-1'
const conn = openCodeConnectionName(CONV)

function context(over: Partial<RunContext> = {}): RunContext {
  return {
    runId: 'run-1',
    sessionId: CONV,
    taskId: null,
    projectId: null,
    model: 'openrouter/x',
    prompt: 'p',
    cwd: '/projects/p1/files',
    containerName: 'agent-c1',
    agent: { id: 'a', handle: 'coder', name: 'Coder', systemPrompt: null, defaultModel: 'm' },
    credential: null,
    riskRules: null,
    packages: {} as RunContext['packages'],
    boundaryOverride: null,
    skills: null,
    claudeHome: { serverDir: '/site/homes/x/.claude', visibleDir: '/home/appuser/.claude' },
    workingTreeDir: '/site/projects/p1/files',
    ...over,
  }
}

/** A restricted agent: read and bash granted, write deferred, web_fetch never. */
function restricted(deferred: DeferredManifest = { tools: [], bashPatterns: [] }): Partial<RunContext> {
  return {
    bypassed: false,
    approvedManifest: { tools: ['read_file', 'glob_files', 'grep_files', 'edit_file', 'create_task'], bashPatterns: ['git status'], approvedAt: 't' },
    deferredManifest: deferred,
    allowedTools: [
      { name: 'read_file', state: 'always' },
      { name: 'glob_files', state: 'always' },
      { name: 'grep_files', state: 'always' },
      { name: 'edit_file', state: 'always' },
      { name: 'write_file', state: 'ask' },
      { name: 'web_fetch', state: 'never' },
      { name: 'bash', state: 'ask' },
      { name: 'create_task', state: 'ask' },
    ],
  }
}

const identity: RealPathResolver = async p => p
let token: string

function startTurn(over: Partial<RunContext> = {}): RunContext {
  const c = context(over)
  token = pointConversationToken(CONV, c.runId, { jwt: 'jwt', expiresAt: Date.now() + 60_000 })
  registerGateRun(c)
  return c
}

const ask = (tool: string, args: Record<string, unknown>, resolveRealPath: RealPathResolver = identity, t = token) =>
  answerHarnessGate(t, { sessionId: 'ses_oc1', callId: 'call_1', tool, args } satisfies HarnessGateRequest, { resolveRealPath })
const rows = () => h.create.mock.calls.map(c => c[0].data)

beforeEach(() => {
  h.create.mockReset()
  h.create.mockResolvedValue({})
  resetGateRunsForTests()
  revokeConversationToken(CONV)
  setOpenCodeSkillsDir(CONV, null)
})

describe('the gate call finds the running turn', () => {
  it('refuses with no turn running: between turns, and for an unknown token', async () => {
    startTurn()
    clearConversationTurn(CONV, 'run-1')
    expect(await ask('read', { filePath: 'a.ts' })).toEqual({ decision: 'refuse', message: NO_TURN_TEXT })
    expect(await ask('read', { filePath: 'a.ts' }, identity, 'not-a-token')).toEqual({ decision: 'refuse', message: NO_TURN_TEXT })
  })

  it('refuses a turn the runtime never registered', async () => {
    token = pointConversationToken(CONV, 'run-9', { jwt: 'jwt', expiresAt: Date.now() + 60_000 })
    expect(await ask('read', { filePath: 'a.ts' })).toEqual({ decision: 'refuse', message: NO_TURN_TEXT })
  })

  it('allows a call of the running turn and records it with the call id', async () => {
    startTurn({ bypassed: true })
    expect(await ask('read', { filePath: '/projects/p1/files/a.ts' })).toEqual({ decision: 'allow' })
    expect(rows()).toEqual([expect.objectContaining({ runId: 'run-1', toolName: 'read_file', toolUseId: 'call_1', riskLevel: 'SAFE', blocked: false })])
  })
})

describe('a stopped turn', () => {
  it('answers a decision still pending with a refusal the moment the turn stops, before the harness is told', async () => {
    startTurn({ bypassed: true })
    let release!: () => void
    const slow: RealPathResolver = p => new Promise(r => { release = () => r(p) })
    const pending = ask('read', { filePath: 'a.ts' }, slow)
    await vi.waitFor(() => expect(release).toBeDefined())
    stopGateRun('run-1')
    expect(await pending).toEqual({ decision: 'refuse', message: RUN_STOPPED_TEXT })
    release()
    await vi.waitFor(() => expect(rows()).toEqual([expect.objectContaining({ blocked: true, blockReason: 'run-stopped' })]))
  })

  it('refuses and records every later decision for that run', async () => {
    startTurn({ bypassed: true })
    stopGateRun('run-1')
    expect(await ask('bash', { command: 'ls' })).toEqual({ decision: 'refuse', message: RUN_STOPPED_TEXT })
    expect(rows()).toEqual([expect.objectContaining({ runId: 'run-1', toolName: 'bash', toolUseId: 'call_1', blockReason: 'run-stopped' })])
  })
})

describe('each OpenCode tool, allowed and refused', () => {
  it.each([
    ['read', { filePath: 'a.ts' }],
    ['glob', { pattern: '**/*.ts' }],
    ['grep', { pattern: 'TODO' }],
    ['edit', { filePath: 'a.ts', oldString: 'a', newString: 'b' }],
    ['apply_patch', { patchText: '*** Begin Patch\n*** Update File: a.ts\n@@\n-a\n+b\n*** End Patch' }],
    ['bash', { command: 'git status --short' }],
    [`${conn}_create_task`, { title: 't' }],
    ['todowrite', { todos: [] }],
    ['skill', { name: 'platform-review' }],
  ])('allows %s when the agent may use it', async (tool, args) => {
    startTurn(restricted())
    expect(await ask(tool, args)).toEqual({ decision: 'allow' })
  })

  it.each([
    ['write', { filePath: 'a.ts', content: 'x' }, 'write_file is not in your approved tool set'],
    ['apply_patch', { patchText: '*** Begin Patch\n*** Add File: n.ts\n+x\n*** End Patch' }, 'write_file is not in your approved tool set'],
    ['bash', { command: 'make build' }, 'Bash is not approved for this run.'],
    ['webfetch', { url: 'https://example.com' }, 'web_fetch is not available for this agent.'],
    [`${conn}_delete_task`, { taskId: 't' }, 'delete_task is not in your approved tool set'],
  ])('refuses %s with the gate\'s steering text', async (tool, args, text) => {
    const deferred: DeferredManifest = { tools: [], bashPatterns: [] }
    startTurn(restricted(deferred))
    const answer = await ask(tool, args)
    expect(answer).toEqual({ decision: 'refuse', message: expect.stringContaining(text) })
  })

  it('refuses a tool the gate does not know, and records it', async () => {
    startTurn({ bypassed: true })
    expect(await ask('websearch', { query: 'q' })).toEqual({ decision: 'refuse', message: 'websearch is not available in Agenthix agent runs.' })
    expect(await ask('agx000000000000_create_task', {})).toEqual(expect.objectContaining({ decision: 'refuse' }))
    expect(rows()[0]).toEqual(expect.objectContaining({ toolName: 'websearch', blocked: true, blockReason: 'unknown-tool' }))
  })
})

describe('OpenCode file tools and the harness home', () => {
  it.each([
    ['read', { filePath: '/home/appuser/.local/share/opencode/auth.json' }],
    ['read', { filePath: '/proc/self/environ' }],
    ['write', { filePath: '/home/appuser/.config/opencode/opencode.json', content: '{}' }],
    ['grep', { pattern: 'KEY', path: '/home' }],
    ['glob', { pattern: '*', path: '/home/appuser/.local/share/opencode' }],
    ['apply_patch', { patchText: '*** Begin Patch\n*** Add File: ../../../home/appuser/.opencode/x.js\n+x\n*** End Patch' }],
  ])('refuses %s %j', async (tool, args) => {
    startTurn({ bypassed: true })
    expect(await ask(tool, args)).toEqual({ decision: 'refuse', message: expect.stringContaining('the harness\'s own files and /proc are not available') })
  })

  it('refuses a planted link into the home, judged on its real path', async () => {
    startTurn({ bypassed: true })
    const planted: RealPathResolver = async p => (p === '/projects/p1/files/x' ? '/home/appuser/.local/share/opencode/opencode.db' : p)
    expect((await ask('read', { filePath: 'x' }, planted)).decision).toBe('refuse')
  })

  it('lets read and grep into OpenCode\'s saved tool output and the conversation\'s staged skills, and nothing writes there', async () => {
    startTurn({ bypassed: true })
    const saved = `/home/appuser/${OPENCODE_TOOL_OUTPUT_DIR}/tool_01J`
    expect(await ask('read', { filePath: saved, offset: 100 })).toEqual({ decision: 'allow' })
    expect(await ask('grep', { pattern: 'error', path: saved })).toEqual({ decision: 'allow' })
    expect((await ask('edit', { filePath: saved, oldString: 'a', newString: 'b' })).decision).toBe('refuse')
    const skill = '/home/appuser/.agenthix/skills/conv-1/platform-review/SKILL.md'
    expect((await ask('read', { filePath: skill })).decision).toBe('refuse')
    setOpenCodeSkillsDir(CONV, '/home/appuser/.agenthix/skills/conv-1')
    expect(await ask('read', { filePath: skill })).toEqual({ decision: 'allow' })
  })

  it('answers allow with the arguments pointing at the checked real path', async () => {
    startTurn({ bypassed: true })
    const linked: RealPathResolver = async p => (p === '/projects/p1/files/link' ? '/projects/p1/files/src/real.ts' : p)
    expect(await ask('edit', { filePath: 'link', oldString: 'a', newString: 'b' }, linked)).toEqual({
      decision: 'allow',
      args: { filePath: '/projects/p1/files/src/real.ts', oldString: 'a', newString: 'b' },
    })
  })
})

describe('the endpoint', () => {
  function res() {
    const r = { statusCode: 200, body: undefined as unknown, status(code: number) { r.statusCode = code; return r }, json(b: unknown) { r.body = b; return r } }
    return r
  }
  const handle = async (headers: Record<string, string>, body: unknown) => {
    const r = res()
    await (harnessGateHandler as unknown as (req: unknown, res: unknown) => Promise<void>)({ headers, body }, r)
    return r
  }

  it('refuses without a bearer or with a malformed request, and decides otherwise', async () => {
    startTurn({ bypassed: true })
    expect(await handle({}, {})).toEqual(expect.objectContaining({ statusCode: 401, body: { decision: 'refuse', message: HARNESS_GATE_UNAVAILABLE } }))
    expect(await handle({ authorization: `Bearer ${token}` }, { tool: 'read' })).toEqual(expect.objectContaining({ statusCode: 400 }))
    const ok = await handle({ authorization: `Bearer ${token}` }, { sessionId: 's', callId: 'c', tool: 'bash', args: { command: 'ls' } })
    expect(ok).toEqual(expect.objectContaining({ statusCode: 200, body: { decision: 'allow' } }))
  })
})
