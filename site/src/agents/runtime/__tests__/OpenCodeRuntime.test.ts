import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('#db', () => ({ prisma: {} }))
vi.mock('../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: () => 'http://site' }))
vi.mock('../landlockCheck', () => ({ requireLandlock: vi.fn() }))

import { OpenCodeRuntime } from '../OpenCodeRuntime'
import { OpenCodeServers } from '../opencode/openCodeServers'
import { fakeDeps, json, type Call, type FakeRelay } from '../opencode/__tests__/fakeRelay'
import { openCodeConnectionName, sessionPermissionRules } from '../opencode/openCodeConnection'
import { resetOpenCodeTurnsForTests, resolveHarnessTurn, openCodeSessionEntry } from '../opencode/openCodeTurns'
import { resolveConversationToken } from '../../../server/runtime/conversationTokens'
import { gateRunContext, resetGateRunsForTests } from '../toolGateRuns'
import { resolveRelayToken } from '../../../server/modelRelay/relayTokens'
import type { HarnessSessionStore } from '../opencode/openCodeSessions'
import type { RunContext, RunEvent } from '../types'

const C = 'agent-c1'
const CONV = 'conv-1'
const CONN = openCodeConnectionName(CONV)

const noSkills = async () => ({ skills: [], systemSection: null })

function context(over: Partial<RunContext> = {}): RunContext {
  return {
    runId: 'run-1', sessionId: CONV, taskId: null, projectId: null,
    model: 'openrouter/qwen/qwen3.8-27b:free', prompt: 'Read the notes and stamp the codeword please now',
    agent: { id: 'a', handle: 'ada', name: 'Ada', systemPrompt: 'You are Ada.', defaultModel: 'openrouter/x' },
    containerName: C, cwd: '/projects/p1/files',
    mcpServers: { platform: { type: 'http', url: 'http://site/mcp', headers: { Authorization: 'Bearer run-token' } } },
    capability: { jwt: 'jwt', expiresAt: Date.now() + 600_000 },
    credential: { kind: 'apiKey', provider: 'openrouter', apiKey: 'or-key' },
    riskRules: null, packages: {} as RunContext['packages'], boundaryOverride: null, skills: null,
    claudeHome: { serverDir: '/h', visibleDir: '/home/appuser' }, workingTreeDir: '/w',
    abortSignal: new AbortController().signal,
    ...over,
  }
}

function memoryStore(rows: Record<string, { harnessSessionId: string | null; title: string | null }> = {}): HarnessSessionStore & { rows: typeof rows } {
  return {
    rows,
    read: async id => rows[id] ?? null,
    write: async (id, harnessSessionId) => { rows[id] = { ...(rows[id] ?? { title: null }), harnessSessionId } },
  }
}

/** A server that runs each turn by emitting a scripted stream once the message is accepted. */
function scripted(script: (relay: FakeRelay, call: Call) => void, extra?: (c: Call) => ReturnType<Parameters<typeof fakeDeps>[0]>) {
  let relay: FakeRelay | undefined
  const { deps, relays } = fakeDeps(c => {
    relay = relays[0]
    const more = extra?.(c)
    if (more) return more
    if (c.path.startsWith('/mcp?')) return json(200, { [(c.body as { name: string }).name]: { status: 'connected' } })
    if (c.path.startsWith('/session?')) return json(200, { id: 'ses_new' })
    if (c.path.includes('/prompt_async')) { setTimeout(() => script(relay!, c), 1); return { status: 204, body: '' } }
    if (c.path.includes('/abort')) return json(200, true)
    return undefined
  })
  return { servers: new OpenCodeServers(deps), relays }
}

const replyAndIdle = (relay: FakeRelay) => {
  relay.emit({ type: 'message.updated', properties: { sessionID: 'ses_new', info: { id: 'm2', sessionID: 'ses_new', role: 'assistant', providerID: 'openrouter', modelID: 'qwen/qwen3.8-27b:free' } } })
  relay.emit({ type: 'message.part.updated', properties: { sessionID: 'ses_new', part: { id: 'p1', sessionID: 'ses_new', messageID: 'm2', type: 'text', text: 'PERSIMMON-42' } } })
  relay.emit({ type: 'session.idle', properties: { sessionID: 'ses_new' } })
}

async function collect(it: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const e of it) out.push(e)
  return out
}

beforeEach(() => {
  resetOpenCodeTurnsForTests()
  resetGateRunsForTests()
})

describe('an OpenCode turn', () => {
  it('runs end to end: connection, session, message and reply, with the model OpenCode reports', async () => {
    const { servers, relays } = scripted(replyAndIdle)
    const store = memoryStore({ [CONV]: { harnessSessionId: null, title: null } })
    const events = await collect(new OpenCodeRuntime({ servers, store, stageSkills: noSkills }).run(context()))

    expect(events).toEqual([
      { type: 'text_delta', textDelta: 'PERSIMMON-42' },
      { type: 'status', status: 'completed', model: 'openrouter/qwen/qwen3.8-27b:free' },
    ])
    const calls = relays[0].calls
    const mcp = calls.find(c => c.path.startsWith('/mcp?'))!
    expect((mcp.body as { name: string }).name).toBe(CONN)
    const token = ((mcp.body as { config: { headers: { Authorization: string } } }).config.headers.Authorization).slice(7)
    expect(token).not.toBe('run-token')

    const create = calls.find(c => c.path.startsWith('/session?'))!
    expect(create.path).toBe('/session?directory=%2Fprojects%2Fp1%2Ffiles')
    expect(create.body).toMatchObject({ title: 'Read the notes and stamp the...' })
    expect((create.body as { permission: unknown[] }).permission[0]).toEqual({ permission: '*', pattern: '*', action: 'allow' })
    expect(store.rows[CONV].harnessSessionId).toBe('ses_new')

    const prompt = calls.find(c => c.path.includes('/prompt_async'))!
    expect(prompt.path).toBe('/session/ses_new/prompt_async?directory=%2Fprojects%2Fp1%2Ffiles')
    expect(prompt.body).toEqual({
      model: { providerID: 'openrouter', modelID: 'qwen/qwen3.8-27b:free' },
      agent: 'build',
      system: 'You are Ada.',
      parts: [{ type: 'text', text: 'Read the notes and stamp the codeword please now' }],
    })
  })

  it('stages the turn\'s skills and adds their section to the system prompt', async () => {
    const { servers, relays } = scripted(replyAndIdle)
    const staged: string[] = []
    const stageSkills = async (_c: unknown, id: string) => {
      staged.push(id)
      return { skills: [{ name: 'notes', description: 'Reads notes', location: '/x/SKILL.md' }], systemSection: '<skills>notes</skills>' }
    }
    await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills }).run(context()))
    expect(staged).toEqual([CONV])
    const prompt = relays[0].calls.find(c => c.path.includes('/prompt_async'))!
    expect((prompt.body as { system: string }).system).toBe('You are Ada.\n\n<skills>notes</skills>')
  })

  it('points the conversation\'s token, a relay token and the plugin\'s turn at this run only while it runs', async () => {
    let during: { token: unknown; turn: ReturnType<typeof resolveHarnessTurn>; relay: ReturnType<typeof resolveRelayToken>; gate: unknown } | undefined
    const { servers, relays } = scripted(relay => {
      const key = relay.starts[0].env.SITE_HARNESS_KEY
      const turn = resolveHarnessTurn(key, 'ses_new')
      const relayToken = turn?.modelHeaders['x-agenthix-turn'] ?? ''
      during = { token: turn && resolveConversationToken(turn.conversationToken), turn, relay: resolveRelayToken(relayToken), gate: gateRunContext('run-1')?.runId }
      replyAndIdle(relay)
    })
    const openai = { kind: 'apiKey', provider: 'openai', apiKey: 'oai-key' } as const
    await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(context({ fallbackCredentials: [openai] })))

    // The plugin is given a relay token, never a key.
    expect(Object.keys(during!.turn!.modelHeaders)).toEqual(['x-agenthix-turn'])
    expect(JSON.stringify(during!.turn)).not.toContain('or-key')
    expect(during!.relay).toMatchObject({ containerName: C, conversationId: CONV, runId: 'run-1' })
    expect(during!.relay!.credentials.get('openrouter')).toEqual({ kind: 'apiKey', provider: 'openrouter', apiKey: 'or-key' })
    expect(during!.relay!.credentials.get('openai')).toEqual(openai)
    expect(resolveRelayToken(during!.turn!.modelHeaders['x-agenthix-turn'])).toBeNull()
    expect(during!.token).toMatchObject({ sessionId: CONV, runId: 'run-1' })
    expect(during!.gate).toBe('run-1')
    const key = relays[0].starts[0].env.SITE_HARNESS_KEY
    expect(resolveHarnessTurn(key, 'ses_new')).toBeNull()
    expect(openCodeSessionEntry('ses_new')).toEqual({ containerName: C, conversationId: CONV, connectionName: CONN })
  })

  it('resumes the conversation\'s own session on later turns', async () => {
    const { servers, relays } = scripted(relay => {
      relay.emit({ type: 'session.idle', properties: { sessionID: 'ses_old' } })
    }, c => (c.method === 'GET' && c.path.startsWith('/session/ses_old?') ? json(200, { id: 'ses_old', permission: sessionPermissionRules(CONN) }) : undefined))
    const store = memoryStore({ [CONV]: { harnessSessionId: 'ses_old', title: 't' } })
    const events = await collect(new OpenCodeRuntime({ servers, store, stageSkills: noSkills }).run(context()))
    expect(events.at(-1)).toMatchObject({ status: 'completed' })
    expect(relays[0].calls.some(c => c.path.startsWith('/session?'))).toBe(false)
    expect(relays[0].calls.some(c => c.path.startsWith('/session/ses_old/prompt_async'))).toBe(true)
  })

  it('creates a restricted agent\'s session with its never-state built-ins denied', async () => {
    const { servers, relays } = scripted(replyAndIdle)
    const restricted = context({ bypassed: false, allowedTools: [{ name: 'bash', state: 'never' }, { name: 'web_fetch', state: 'never' }, { name: 'read_file', state: 'always' }], approvedManifest: { tools: [], bashPatterns: [], approvedAt: 't' } })
    await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(restricted))
    const create = relays[0].calls.find(c => c.path.startsWith('/session?'))!
    expect((create.body as { permission: unknown }).permission).toEqual(sessionPermissionRules(CONN, ['bash', 'webfetch']))
  })

  it('creates the session of a run with no approved manifest with its ask-state built-ins and platform tools denied too', async () => {
    const { servers, relays } = scripted(replyAndIdle)
    const tools = ['read_file', 'write_file', 'edit_file', 'glob_files', 'grep_files', 'web_fetch'].map(name => ({ name, state: 'always' as const }))
    const unattended = context({
      bypassed: false,
      allowedTools: [...tools, { name: 'bash', state: 'ask' }, { name: 'fetch_my_queued_tasks', state: 'always' }, { name: 'run_task', state: 'always' }],
    })
    await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(unattended))
    const create = relays[0].calls.find(c => c.path.startsWith('/session?'))!
    const denied = (create.body as { permission: { permission: string; action: string }[] }).permission
      .slice(sessionPermissionRules(CONN).length).map(r => r.permission)
    expect(denied[0]).toBe('bash')
    expect(denied).toContain(`${CONN}_create_task`)
    expect(denied).not.toContain(`${CONN}_fetch_my_queued_tasks`)
    expect(denied).not.toContain(`${CONN}_run_task`)
    expect(denied).not.toContain('read')
  })

  it('brings a resumed session\'s rules up to this turn\'s permissions, and leaves rules already current', async () => {
    const current = sessionPermissionRules(CONN, ['bash'])
    let held: unknown[] = sessionPermissionRules(CONN)
    const { servers, relays } = scripted(relay => {
      relay.emit({ type: 'session.idle', properties: { sessionID: 'ses_old' } })
    }, c => {
      if (!c.path.startsWith('/session/ses_old?')) return undefined
      if (c.method === 'GET') return json(200, { id: 'ses_old', permission: held })
      if (c.method === 'PATCH') { held = [...held, ...(c.body as { permission: unknown[] }).permission]; return json(200, { id: 'ses_old' }) }
      return undefined
    })
    const store = memoryStore({ [CONV]: { harnessSessionId: 'ses_old', title: 't' } })
    const runtime = new OpenCodeRuntime({ servers, store, stageSkills: noSkills })
    const restricted = context({ bypassed: false, allowedTools: [{ name: 'bash', state: 'never' }], approvedManifest: { tools: [], bashPatterns: [], approvedAt: 't' } })

    expect((await collect(runtime.run(restricted))).at(-1)).toMatchObject({ status: 'completed' })
    const patches = () => relays[0].calls.filter(c => c.method === 'PATCH')
    expect(patches()).toHaveLength(1)
    expect(patches()[0].path).toBe('/session/ses_old?directory=%2Fprojects%2Fp1%2Ffiles')
    expect(patches()[0].body).toEqual({ permission: current })

    await collect(runtime.run({ ...restricted, runId: 'run-2' }))
    expect(patches()).toHaveLength(1)
    const prompts = relays[0].calls.filter(c => c.path.includes('/prompt_async'))
    expect(prompts).toHaveLength(2)
  })

  it('fails the turn, sending no message, when a resumed session\'s rules cannot be brought up to date', async () => {
    const { servers, relays } = scripted(() => {}, c => {
      if (c.method === 'GET' && c.path.startsWith('/session/ses_old?')) return json(200, { id: 'ses_old', permission: [] })
      if (c.method === 'PATCH') return { status: 500, body: 'no' }
      return undefined
    })
    const store = memoryStore({ [CONV]: { harnessSessionId: 'ses_old', title: 't' } })
    await expect(collect(new OpenCodeRuntime({ servers, store, stageSkills: noSkills }).run(context()))).rejects.toThrow(/permission rules/)
    expect(relays[0].calls.some(c => c.path.includes('/prompt_async'))).toBe(false)
  })

  it('aborts OpenCode\'s session on a cancel and ends as cancelled', async () => {
    const controller = new AbortController()
    const { servers, relays } = scripted(() => controller.abort())
    const events = await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(context({ abortSignal: controller.signal })))
    expect(events.at(-1)).toMatchObject({ type: 'status', status: 'cancelled' })
    await new Promise(r => setTimeout(r, 5))
    expect(relays[0].calls.some(c => c.path === '/session/ses_new/abort?directory=%2Fprojects%2Fp1%2Ffiles')).toBe(true)
  })

  it('shows OpenCode\'s retries of a rate-limited model, then aborts its session and fails with the provider\'s reason', async () => {
    const retry = (relay: FakeRelay, attempt: number) => relay.emit({
      type: 'session.status',
      properties: { sessionID: 'ses_new', status: { type: 'retry', attempt, message: 'Rate limit exceeded: free-models-per-min', next: Date.now() + 2_000 } },
    })
    const { servers, relays } = scripted(relay => { for (const n of [1, 2, 3, 4]) retry(relay, n) })
    const events = await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(context()))
    expect(events).toEqual([
      { type: 'notice', notice: 'The provider is rate-limiting this model; retrying (attempt 1)…' },
      { type: 'notice', notice: 'The provider is rate-limiting this model; retrying (attempt 2)…' },
      { type: 'notice', notice: 'The provider is rate-limiting this model; retrying (attempt 3)…' },
      { type: 'status', status: 'failed', error: 'The model provider was still failing after 3 retries: Rate limit exceeded: free-models-per-min' },
    ])
    await new Promise(r => setTimeout(r, 5))
    expect(relays[0].calls.some(c => c.path === '/session/ses_new/abort?directory=%2Fprojects%2Fp1%2Ffiles')).toBe(true)
  })

  it('fails the turn with the message of the error OpenCode reported', async () => {
    const { servers } = scripted(relay => {
      relay.emit({ type: 'session.error', properties: { sessionID: 'ses_new', error: { name: 'APIError', data: { statusCode: 429, message: 'Rate limit exceeded' } } } })
      relay.emit({ type: 'session.idle', properties: { sessionID: 'ses_new' } })
    })
    const events = await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(context()))
    expect(events.at(-1)).toEqual({ type: 'status', status: 'failed', error: 'The model provider answered 429: Rate limit exceeded' })
  })

  it('fails the turn when the server stops under it', async () => {
    const { servers } = scripted(relay => relay.crash())
    const events = await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(context()))
    expect(events.at(-1)).toEqual({ type: 'status', status: 'failed', error: 'The turn ended because the OpenCode server stopped during the turn.' })
  })

  it('refuses before starting anything: no container, a model with no provider, a wrong or missing key', async () => {
    const { servers, relays } = scripted(replyAndIdle)
    const runtime = new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills })
    await expect(collect(runtime.run(context({ containerName: undefined })))).rejects.toThrow(/only in an agent container/)
    await expect(collect(runtime.run(context({ model: 'claude-sonnet-4-5' })))).rejects.toThrow(/name it with its provider/)
    await expect(collect(runtime.run(context({ credential: null })))).rejects.toThrow(/No model credential/)
    await expect(collect(runtime.run(context({ credential: { kind: 'subscription', provider: 'anthropic', oauthJson: '{}', grantId: 'grant-1', loginId: 'login-1' } })))).rejects.toThrow(/Claude runtime/)
    expect(relays).toHaveLength(0)
  })

  it('fails the turn and clears its token when OpenCode refuses the message', async () => {
    const { servers } = scripted(() => {}, c => (c.path.includes('/prompt_async') ? { status: 400, body: 'bad model' } : undefined))
    await expect(collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(context()))).rejects.toThrow(/did not accept the message.*bad model/)
    expect(servers.isRunning(C)).toBe(true)
  })
})

describe('the existence check', () => {
  const query = { sessionId: CONV, harnessHomeDir: '/h', workingDirectory: '/projects/p1/files', containerName: C }

  it('is a 200 for a session OpenCode holds, and false for a 404', async () => {
    const { servers } = scripted(() => {}, c => (c.path.startsWith('/session/ses_a?') ? json(200, { id: 'ses_a' }) : c.path.startsWith('/session/ses_b?') ? { status: 404, body: '' } : undefined))
    const runtime = new OpenCodeRuntime({ servers, store: memoryStore({ [CONV]: { harnessSessionId: 'ses_a', title: null }, other: { harnessSessionId: 'ses_b', title: null } }) })
    await expect(runtime.sessionExists(query)).resolves.toBe(true)
    await expect(runtime.sessionExists({ ...query, sessionId: 'other' })).resolves.toBe(false)
  })

  it('is false for a conversation that never had an OpenCode session', async () => {
    const { servers, relays } = scripted(() => {})
    await expect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).sessionExists(query)).resolves.toBe(false)
    expect(relays).toHaveLength(0)
  })

  it('never reads silence as absence: it asks again, and gives up with an error, not false', async () => {
    let n = 0
    const { servers } = scripted(() => {}, c => (c.path.startsWith('/session/ses_a?') ? (++n < 3 ? { status: 0, body: '', error: 'ECONNREFUSED' } : { status: 404, body: '' }) : undefined))
    const store = memoryStore({ [CONV]: { harnessSessionId: 'ses_a', title: null } })
    await expect(new OpenCodeRuntime({ servers, store, stageSkills: noSkills }).sessionExists(query)).resolves.toBe(false)
    expect(n).toBe(3)

    const { servers: silent } = scripted(() => {}, c => (c.path.startsWith('/session/') ? { status: 500, body: '' } : undefined))
    const { openCodeSessionExists } = await import('../opencode/openCodeSessions')
    await silent.ensureServer(C, null)
    await expect(openCodeSessionExists(silent, C, 'ses_a', '/p', 300)).rejects.toThrow(/Could not tell/)
  })

  it('keeps the server for the run when the session is found, and stops it when nothing is found', async () => {
    const found = scripted(() => {}, c => (c.path.startsWith('/session/ses_a?') ? json(200, { id: 'ses_a' }) : c.path.startsWith('/session/ses_b?') ? { status: 404, body: '' } : undefined))
    const store = memoryStore({ [CONV]: { harnessSessionId: 'ses_a', title: null }, gone: { harnessSessionId: 'ses_b', title: null } })
    const runtime = new OpenCodeRuntime({ servers: found.servers, store })
    await expect(runtime.sessionExists(query)).resolves.toBe(true)
    expect(found.servers.isRunning(C)).toBe(true)
    await expect(runtime.sessionExists({ ...query, sessionId: 'gone' })).resolves.toBe(false)
    expect(found.servers.isRunning(C)).toBe(false)
  })

  it('stops the server the check started when the run then refuses before holding it', async () => {
    const { servers } = scripted(() => {}, c => (c.path.startsWith('/session/ses_a?') ? json(200, { id: 'ses_a' }) : undefined))
    const runtime = new OpenCodeRuntime({ servers, store: memoryStore({ [CONV]: { harnessSessionId: 'ses_a', title: null } }), stageSkills: noSkills })
    await runtime.sessionExists(query)
    expect(servers.isRunning(C)).toBe(true)
    await expect(collect(runtime.run(context({ credential: null })))).rejects.toThrow()
    expect(servers.isRunning(C)).toBe(false)
  })

  it('leaves the server up while a conversation holds it', async () => {
    const { servers } = scripted(() => {}, c => (c.path.startsWith('/session/ses_a?') ? json(200, { id: 'ses_a' }) : undefined))
    const runtime = new OpenCodeRuntime({ servers, store: memoryStore({ [CONV]: { harnessSessionId: 'ses_a', title: null } }) })
    await servers.ensureServer(C, null)
    servers.turnStarted(C, 'other-conv')
    await expect(runtime.sessionExists(query)).resolves.toBe(true)
    expect(servers.isRunning(C)).toBe(true)
  })

  it('needs the run\'s container', async () => {
    const { servers } = scripted(() => {})
    await expect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).sessionExists({ ...query, containerName: null })).rejects.toThrow(/agent container/)
  })
})

describe('a conversation going idle or ending', () => {
  it('lets go of the server when it was the last conversation', async () => {
    const { servers } = scripted(replyAndIdle)
    const runtime = new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills })
    await collect(runtime.run(context()))
    expect(servers.isRunning(C)).toBe(true)
    await runtime.conversationIdle({ sessionId: CONV, containerName: C })
    expect(servers.isRunning(C)).toBe(false)
    await expect(runtime.endConversation({ sessionId: 'unknown', containerName: null })).resolves.toBeUndefined()
  })
})

describe("an OpenCode session's memory", () => {
  const providers = { providers: [{ id: 'openrouter', models: { 'qwen/qwen3.8-27b:free': { limit: { context: 128_000, output: 16_000 } } } }], default: {} }
  const step = (relay: FakeRelay, messageID: string, tokens: Record<string, unknown>) =>
    relay.emit({ type: 'message.part.updated', properties: { sessionID: 'ses_new', part: { id: `s-${messageID}`, sessionID: 'ses_new', messageID, type: 'step-finish', reason: 'stop', cost: 0, tokens } } })

  it('ends each turn saying how full it is, against the model\'s window', async () => {
    const { servers } = scripted(relay => {
      relay.emit({ type: 'message.updated', properties: { sessionID: 'ses_new', info: { id: 'm2', sessionID: 'ses_new', role: 'assistant' } } })
      step(relay, 'm2', { input: 1_000, output: 100, reasoning: 0, cache: { read: 60_000, write: 0 } })
      relay.emit({ type: 'session.idle', properties: { sessionID: 'ses_new' } })
    }, c => (c.path.startsWith('/config/providers') ? json(200, providers) : undefined))
    const events = await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills }).run(context({ containerName: 'agent-mem-1' })))

    expect(events.find(e => e.type === 'context_use')).toMatchObject({ use: { tokens: 61_100, summarisesAt: 112_000, window: 128_000 } })
    expect(events.at(-1)).toMatchObject({ type: 'status', status: 'completed' })
  })

  it('summarises on request with the session\'s own summarize call, sending no message', async () => {
    let relay: FakeRelay | undefined
    const { servers, relays } = scripted(() => {}, c => {
      relay = relays[0]
      if (!c.path.includes('/summarize')) return undefined
      setTimeout(() => {
        relay!.emit({ type: 'message.updated', properties: { sessionID: 'ses_new', info: { id: 'm3', sessionID: 'ses_new', role: 'user' } } })
        relay!.emit({ type: 'message.part.updated', properties: { sessionID: 'ses_new', part: { id: 'c1', sessionID: 'ses_new', messageID: 'm3', type: 'compaction', auto: false } } })
        relay!.emit({ type: 'message.updated', properties: { sessionID: 'ses_new', info: { id: 'm4', sessionID: 'ses_new', role: 'assistant', summary: true } } })
        relay!.emit({ type: 'message.part.updated', properties: { sessionID: 'ses_new', part: { id: 'p4', sessionID: 'ses_new', messageID: 'm4', type: 'text', text: 'What we agreed.' } } })
        relay!.emit({ type: 'session.compacted', properties: { sessionID: 'ses_new' } })
        relay!.emit({ type: 'session.idle', properties: { sessionID: 'ses_new' } })
      }, 1)
      return json(200, true)
    })
    const events = await collect(new OpenCodeRuntime({ servers, store: memoryStore(), stageSkills: noSkills })
      .run(context({ containerName: 'agent-mem-2', prompt: '/compact', summarise: true })))

    const calls = relays[0].calls
    expect(calls.some(c => c.path.includes('/prompt_async'))).toBe(false)
    expect(calls.find(c => c.path.includes('/summarize'))!.body).toEqual({ providerID: 'openrouter', modelID: 'qwen/qwen3.8-27b:free', auto: false })
    expect(events.filter(e => e.type === 'compacted')).toEqual([{ type: 'compacted', trigger: 'manual', summary: 'What we agreed.', tokensBefore: null }])
    expect(events.some(e => e.type === 'text_delta')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'status', status: 'completed' })
  })
})
