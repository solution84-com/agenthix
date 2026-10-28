import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs/promises', () => ({
  default: {
    mkdtemp: vi.fn().mockResolvedValue('/site/homes/project-proj-alpha/.tmp/skills-123'),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    symlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('---\nname: Test Skill\n---\n'),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

// Keep the real Prisma client out of this test. Severed from
// hq's version (plan 5d-2 task 7b): sdkToolGate.ts no longer reads
// prisma.siteConfig (riskRules now rides on RunContext), so only toolCallLog
// (one of the four runtime models site owns) needs mocking here.
vi.mock('#db', () => ({
  prisma: {
    toolCallLog: { create: vi.fn().mockResolvedValue({}) },
  },
}))

vi.mock('../landlockCheck', () => ({ requireLandlock: vi.fn(async () => {}) }))
vi.mock('../DockerSpawner', () => ({
  // A client that has already exited, as one does once its process ends.
  spawnDockerClaude: vi.fn(() => ({ once: vi.fn((_event: string, onExit: () => void) => onExit()), stderr: null })),
}))

vi.mock('../claude/claudeProcessProbe', () => ({
  claudeProcessMemoryMb: vi.fn().mockResolvedValue(300),
  killClaudeProcess: vi.fn().mockResolvedValue(0),
  harnessMemoryCeilingMb: vi.fn(() => 1024),
}))

// Skill staging (namespaced sources + a boundary's disk overrides) is
// covered on its own in skillStaging.test.ts — here it's a stand-in so
// ClaudeSDKRuntime's tmpdir wiring can be tested independently of it.
vi.mock('../skillStaging', () => ({
  stageSkills: vi.fn(async () => ({ staged: [], refused: [] })),
}))

import { ClaudeSDKRuntime } from '../ClaudeSDKRuntime'
// buildSdkBuiltinTools moved to sdkNames.ts (SDK name adapter extraction)
import { buildSdkBuiltinTools } from '../sdkNames'
import { stageSkills } from '../skillStaging'
import type { RunContext, RunEvent } from '../types'

const mockQuery = vi.mocked((await import('@anthropic-ai/claude-agent-sdk')).query)
const mockStageSkills = vi.mocked(stageSkills)

// A conversation's process outlives its turn; each test starts without one.
afterEach(async () => {
  await new ClaudeSDKRuntime().endConversation({ sessionId: 'session-1', containerName: null })
})

/** Asks the query's spawn option to start the process, as the SDK would. */
function spawnWith(options: Record<string, unknown> | undefined) {
  const spawnFn = options?.spawnClaudeCodeProcess as (o: unknown) => unknown
  return spawnFn({ command: 'claude', args: ['--verbose'], cwd: '/projects/web/files', env: {}, signal: new AbortController().signal })
}

const baseContext: RunContext = {
  runId: 'run-1',
  sessionId: 'session-1',
  taskId: null,
  projectId: null,
  model: 'claude-sonnet-4-6',
  prompt: 'Fix the bug',
  cwd: '/projects/web/files',
  agent: {
    id: 'agent-1',
    handle: 'coder',
    name: 'Coder',
    systemPrompt: 'You are a senior engineer.',
    defaultModel: 'claude-sonnet-4-6',
  },
  credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'test-key' },
  riskRules: null,
  packages: {
    refs: {
      agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
      org: null,
      platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
    },
    agentDir: '/cache/agent',
    orgDir: null,
    platformDir: '/cache/platform',
  },
  boundaryOverride: null,
  skills: null,
  // The Claude home belongs to the storage boundary the run's container serves
  // — never to the agent. Both views of one directory; the second is what the
  // SDK is told.
  claudeHome: { serverDir: '/site/homes/project-proj-alpha', visibleDir: '/site/homes/project-proj-alpha' },
  workingTreeDir: '/projects/web/files',
}

function makeSDKStream(messages: any[]) {
  return (async function* () {
    for (const msg of messages) yield msg
  })()
}

describe('ClaudeSDKRuntime @SC-119', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-key'
    // Skills are staged under the boundary's Claude home, which the launch
    // resolves from SITE_ROOT — pinned here so the paths below don't follow
    // the cwd.
    process.env.SITE_ROOT = '/site'
    delete process.env.AGENT_CONTAINER_ISOLATION
  })

  it('yields text_delta from stream_event content_block_delta', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      },
      { type: 'result', subtype: 'success' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    const events: RunEvent[] = []
    for await (const event of runtime.run(baseContext)) {
      events.push(event)
    }

    expect(events).toContainEqual({ type: 'text_delta', textDelta: 'Hello' })
  })

  it('yields tool_call from assistant message content', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: 'src/auth.ts' } }],
        },
      },
      { type: 'result', subtype: 'success' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    const events: RunEvent[] = []
    for await (const event of runtime.run(baseContext)) {
      events.push(event)
    }

    expect(events).toContainEqual({
      type: 'tool_call',
      toolUseId: 'tu-1',
      toolName: 'Read',
      toolInput: { file_path: 'src/auth.ts' },
    })
  })

  it('yields tool_result from user message content', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'file contents here' }],
        },
      },
      { type: 'result', subtype: 'success' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    const events: RunEvent[] = []
    for await (const event of runtime.run(baseContext)) {
      events.push(event)
    }

    expect(events).toContainEqual({
      type: 'tool_result',
      toolUseId: 'tu-1',
      output: 'file contents here',
    })
  })

  it('yields completed status on success result', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'success' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    const events: RunEvent[] = []
    for await (const event of runtime.run(baseContext)) {
      events.push(event)
    }

    expect(events).toContainEqual(expect.objectContaining({ type: 'status', status: 'completed' }))
  })

  it('yields failed status on error result', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'error_during_execution', error: 'Something broke' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    const events: RunEvent[] = []
    for await (const event of runtime.run(baseContext)) {
      events.push(event)
    }

    expect(events).toContainEqual(expect.objectContaining({
      type: 'status',
      status: 'failed',
      error: 'Something broke',
    }))
  })

  it('uses resume for conversational runs (taskId is null)', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'success' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    for await (const _ of runtime.run({ ...baseContext, taskId: null })) { /* drain */ }

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ resume: 'session-1' }),
    }))
  })

  it('uses sessionId (not resume) for task runs when isNewSession is true', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'success' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    for await (const _ of runtime.run({ ...baseContext, taskId: 'task-abc', isNewSession: true })) { /* drain */ }

    const callOpts = mockQuery.mock.calls[0]![0].options
    // New session uses sessionId: AgentSession.id, not 'resume'
    expect(callOpts!.sessionId).toBe('session-1')
    expect(callOpts).not.toHaveProperty('resume')
    expect(callOpts).not.toHaveProperty('persistSession')
  })

  it('uses resume for task runs when isNewSession is false', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'success' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    for await (const _ of runtime.run({ ...baseContext, taskId: 'task-abc', isNewSession: false })) { /* drain */ }

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ resume: 'session-1' }),
    }))
  })

  // adr-0076: a failed resume is never answered with a fresh session under the
  // same id. "exited with code 1" is also what a misconfigured MCP server gives.
  it('never starts a fresh session when a resume fails', async () => {
    mockQuery.mockImplementation(() => (async function* () {
      throw new Error('Claude Code process exited with code 1')
    })() as any)

    const runtime = new ClaudeSDKRuntime()
    const drain = async () => { for await (const _ of runtime.run({ ...baseContext, isNewSession: false })) { /* drain */ } }

    await expect(drain()).rejects.toThrow('exited with code 1')
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0]?.[0].options).toMatchObject({ resume: 'session-1' })
  })

  it('reports a failed result as a failure, not a reason to start afresh', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'error_during_execution', error: 'No conversation found with session ID: session-1' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    const events: RunEvent[] = []
    for await (const event of runtime.run({ ...baseContext, isNewSession: false })) events.push(event)

    expect(events).toContainEqual({ type: 'status', status: 'failed', error: 'No conversation found with session ID: session-1' })
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it('resumes when the harness already holds a conversation our record counts as new', async () => {
    mockQuery
      .mockImplementationOnce(() => (async function* () { throw new Error('Session ID session-1 is already in use.') })() as any)
      .mockReturnValueOnce(makeSDKStream([{ type: 'result', subtype: 'success' }]) as any)

    const runtime = new ClaudeSDKRuntime()
    for await (const _ of runtime.run({ ...baseContext, isNewSession: true })) { /* drain */ }

    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect(mockQuery.mock.calls[0]?.[0].options).toMatchObject({ sessionId: 'session-1' })
    expect(mockQuery.mock.calls[1]?.[0].options).toMatchObject({ resume: 'session-1' })
  })

  it("never loads the claude.ai connectors of the account behind a subscription — without a container", async () => {
    mockQuery.mockReturnValue(makeSDKStream([{ type: 'result', subtype: 'success' }]) as any)

    for await (const _ of new ClaudeSDKRuntime().run(baseContext)) { /* drain */ }

    expect(mockQuery.mock.calls[0]?.[0].options?.env).toMatchObject({ ENABLE_CLAUDEAI_MCP_SERVERS: 'false' })
  })

  it("never loads the claude.ai connectors of the account behind a subscription — in a container", async () => {
    const { spawnDockerClaude } = await import('../DockerSpawner')
    mockQuery.mockReturnValue(makeSDKStream([{ type: 'result', subtype: 'success' }]) as any)

    const context = { ...baseContext, containerName: 'agent-c', gitCredEnv: { AGENT_HANDLE: 'kernel' } }
    for await (const _ of new ClaudeSDKRuntime().run(context)) { /* drain */ }
    spawnWith(mockQuery.mock.calls[0]?.[0].options)

    expect(vi.mocked(spawnDockerClaude)).toHaveBeenCalledWith('agent-c', expect.objectContaining({
      AGENT_HANDLE: 'kernel',
      ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    }), expect.anything())
  })

  it("uses the run's own cwd — no process.cwd() fallback", async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'success' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    for await (const _ of runtime.run(baseContext)) { /* drain */ }

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ cwd: '/projects/web/files' }),
    }))
  })

  it('passes additionalDirectories when custom agent skills exist', async () => {
    mockStageSkills.mockResolvedValueOnce({ staged: [{ source: 'org', slug: 'x', name: 'org-x', fingerprint: 'f' }], refused: [] })

    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'success' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    const events: RunEvent[] = []
    for await (const event of runtime.run(baseContext)) {
      events.push(event)
    }

    const callOptions = mockQuery.mock.calls[0]?.[0].options
    expect(callOptions?.additionalDirectories).toEqual(['/site/homes/project-proj-alpha/.tmp/skills-123'])
  })

  it('hands the staged skills over as a local plugin, allowlisted, with inline skill commands off', async () => {
    const fsMod = (await import('node:fs/promises')).default as any
    mockStageSkills.mockResolvedValueOnce({ staged: [{ source: 'org', slug: 'x', name: 'org-x', fingerprint: 'f' }, { source: 'agent', slug: 'y', name: 'agent-y', fingerprint: 'f' }], refused: [] })
    mockQuery.mockReturnValue(makeSDKStream([{ type: 'result', subtype: 'success' }]) as any)

    for await (const _ of new ClaudeSDKRuntime().run(baseContext)) { /* drain */ }

    const options = mockQuery.mock.calls[0]?.[0].options
    expect(options?.plugins).toEqual([{ type: 'local', path: '/site/homes/project-proj-alpha/.tmp/skills-123/.claude' }])
    expect(options?.skills).toEqual(['org-x', 'agent-y'])
    expect(options?.settingSources).toEqual([])
    expect(options?.tools).toContain('Skill')
    expect(options?.settings).toMatchObject({ disableSkillShellExecution: true })
    expect(fsMod.writeFile).toHaveBeenCalledWith(
      '/site/homes/project-proj-alpha/.tmp/skills-123/.claude/.claude-plugin/plugin.json', JSON.stringify({ name: 'agenthix' }))
  })

  it('allowlists no skill and loads no plugin when none are staged, so the bundled ones stay hidden', async () => {
    mockQuery.mockReturnValue(makeSDKStream([{ type: 'result', subtype: 'success' }]) as any)

    for await (const _ of new ClaudeSDKRuntime().run(baseContext)) { /* drain */ }

    const options = mockQuery.mock.calls[0]?.[0].options
    expect(options?.plugins).toBeUndefined()
    expect(options?.skills).toEqual([])
    expect(options?.settings).toMatchObject({ disableSkillShellExecution: true })
  })

  it('omits additionalDirectories when no skills exist', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'success' },
    ]) as any)

    const runtime = new ClaudeSDKRuntime()
    for await (const _ of runtime.run(baseContext)) {}

    const callOptions = mockQuery.mock.calls[0]?.[0].options
    expect(callOptions?.additionalDirectories).toBeUndefined()
  })
})

describe('skills tmpdir location', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('creates tmpdir inside workspace dir, not os.tmpdir()', async () => {
    const mockFs = await import('node:fs/promises')
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'success', usage: null },
    ]) as any)

    const events: RunEvent[] = []
    for await (const e of new ClaudeSDKRuntime().run({ ...baseContext })) {
      events.push(e)
    }

    const mkdtempMock = vi.mocked(mockFs.default.mkdtemp)
    const mkdtempCall = mkdtempMock.mock.calls[0]?.[0] ?? ''
    // Staged inside the boundary's Claude home — the directory bound into the
    // run's container — not os.tmpdir() directly.
    expect(mkdtempCall).toContain('/site/homes/project-proj-alpha')
    expect(mkdtempCall).toContain('.tmp')
  })
})

// A run's skills are staged inside the Claude home bound into its container,
// which belongs to the storage boundary that container serves rather than to
// the agent. The path is built twice: through the site server's own view of
// that directory, where the staging actually happens, and through the run's
// view of it, which is what the SDK is told about.
describe('skills are staged where the run can reach them', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.SITE_ROOT = '/site'
  })

  const containerizedContext: RunContext = {
    ...baseContext,
    containerName: 'agenthix-agent-project-proj-alpha-rw',
    // Under isolation the run is told the fixed container path, and nothing of
    // the site's own layout.
    claudeHome: { serverDir: '/site/homes/project-proj-alpha', visibleDir: '/home/appuser/.claude' },
  }

  it("creates the skills tmpdir on the site's own view of the boundary home", async () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    const fsMod = (await import('node:fs/promises')).default as any
    mockStageSkills.mockResolvedValueOnce({ staged: [{ source: 'org', slug: 'x', name: 'org-x', fingerprint: 'f' }], refused: [] })
    mockQuery.mockReturnValue(makeSDKStream([{ type: 'result', subtype: 'success' }]) as any)

    for await (const _ of new ClaudeSDKRuntime().run(containerizedContext)) { /* drain */ }

    const mkdtempCall = fsMod.mkdtemp.mock.calls[0]?.[0] ?? ''
    expect(mkdtempCall).toContain('/site/homes/project-proj-alpha/.tmp/skills-')
    // Not rooted at the container path — this is a server-side fs op on the host.
    expect(mkdtempCall.startsWith('/home/appuser')).toBe(false)
  })

  it('hands the SDK the run-visible path in additionalDirectories in both modes', async () => {
    const fsMod = (await import('node:fs/promises')).default as any

    // Container mode: the site's own path -> the fixed container path.
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    mockStageSkills.mockResolvedValueOnce({ staged: [{ source: 'org', slug: 'x', name: 'org-x', fingerprint: 'f' }], refused: [] })
    fsMod.mkdtemp.mockImplementation(async (prefix: string) => `${prefix}xyz`)
    mockQuery.mockReturnValue(makeSDKStream([{ type: 'result', subtype: 'success' }]) as any)

    for await (const _ of new ClaudeSDKRuntime().run(containerizedContext)) { /* drain */ }
    const containerCallOptions = mockQuery.mock.calls[0]?.[0].options
    expect(containerCallOptions?.additionalDirectories).toEqual(['/home/appuser/.claude/.tmp/skills-xyz'])

    // Dev mode: there is no container, so the two views are the same path.
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.SITE_ROOT = '/site'
    delete process.env.AGENT_CONTAINER_ISOLATION
    mockStageSkills.mockResolvedValueOnce({ staged: [{ source: 'org', slug: 'x', name: 'org-x', fingerprint: 'f' }], refused: [] })
    fsMod.mkdtemp.mockImplementation(async (prefix: string) => `${prefix}xyz`)
    mockQuery.mockReturnValue(makeSDKStream([{ type: 'result', subtype: 'success' }]) as any)

    for await (const _ of new ClaudeSDKRuntime().run(baseContext)) { /* drain */ }
    const devCallOptions = mockQuery.mock.calls[0]?.[0].options
    expect(devCallOptions?.additionalDirectories).toEqual(['/site/homes/project-proj-alpha/.tmp/skills-xyz'])
  })
})

describe('docker spawner injection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('starts the process on this machine when context.containerName is absent', async () => {
    const { spawnDockerClaude } = await import('../DockerSpawner')
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'success', usage: null },
    ]) as any)

    for await (const _ of new ClaudeSDKRuntime().run({ ...baseContext })) {}

    const [call] = mockQuery.mock.calls
    expect(typeof (call![0].options as any)?.spawnClaudeCodeProcess).toBe('function')
    expect(vi.mocked(spawnDockerClaude)).not.toHaveBeenCalled()
  })

  it('starts the process with docker exec when context.containerName is set', async () => {
    mockQuery.mockReturnValue(makeSDKStream([
      { type: 'result', subtype: 'success', usage: null },
    ]) as any)

    const { spawnDockerClaude } = await import('../DockerSpawner')

    for await (const _ of new ClaudeSDKRuntime().run({ ...baseContext, containerName: 'test-container' })) {}
    spawnWith(mockQuery.mock.calls[0]![0].options)

    expect(vi.mocked(spawnDockerClaude)).toHaveBeenCalledWith('test-container', expect.objectContaining({ ENABLE_CLAUDEAI_MCP_SERVERS: 'false' }), expect.anything())
  })
})

// Regression guard for smoke-test Finding 2: bypassed agents were silently
// stripped of Bash (the SDK `tools` whitelist subtracted default-derived neverTools
// even for bypassed agents), so the kernel couldn't run git/shell.
describe('buildSdkBuiltinTools — bypassed agents keep the full built-in set', () => {
  it('bypassed: returns all built-ins incl. Bash even when neverTools defaults bash/web to never', () => {
    const tools = buildSdkBuiltinTools({
      bypassed: true,
      neverTools: ['bash', 'web_fetch', 'web_search'],
      allowedTools: undefined,
    })
    expect(tools).toContain('Bash')
    expect(tools).toContain('WebFetch')
    expect(tools).toContain('WebSearch')
  })

  it('restricted: returns only allowed always/ask built-ins, minus never-state', () => {
    const tools = buildSdkBuiltinTools({
      bypassed: false,
      neverTools: ['bash'],
      allowedTools: [
        { name: 'read_file', state: 'always' },
        { name: 'bash', state: 'never' },
      ],
    })
    expect(tools).toContain('Read')
    expect(tools).not.toContain('Bash')
  })
})
