/**
 * What the OpenCode runtime's tests share: a turn's context, a conversation row store in memory, and an OpenCode server
 * that answers each turn from a script.
 */
import { OpenCodeServers } from '../opencode/openCodeServers'
import { fakeDeps, json, type Call, type FakeRelay } from '../opencode/__tests__/fakeRelay'
import { openCodeConnectionName } from '../opencode/openCodeConnection'
import type { HarnessSessionStore } from '../opencode/openCodeSessions'
import type { RunContext, RunEvent } from '../types'

export const C = 'agent-c1'
export const CONV = 'conv-1'
export const CONN = openCodeConnectionName(CONV)

export const noSkills = async () => ({ skills: [], systemSection: null, invocable: [] })

export function context(over: Partial<RunContext> = {}): RunContext {
  return {
    runId: 'run-1', sessionId: CONV, taskId: null, projectId: null,
    model: 'openrouter/qwen/qwen3.8-27b:free', prompt: 'Read the notes and stamp the codeword please now',
    agent: { id: 'a', handle: 'ada', name: 'Ada', systemPrompt: 'You are Ada.', defaultModel: 'openrouter/x' },
    containerName: C, cwd: '/projects/p1/files',
    mcpServers: { platform: { type: 'http', url: 'http://site/mcp', headers: { Authorization: 'Bearer run-token' } } },
    capability: { jwt: 'jwt', expiresAt: Date.now() + 600_000 },
    credential: { kind: 'apiKey', provider: 'openrouter', apiKey: 'or-key' },
    // The organisation's search key: a turn without one is not shown web_search (OpenCodeRuntime.webSearch.test.ts).
    webSearchKey: 'exa-key',
    riskRules: null, packages: {} as RunContext['packages'], boundaryOverride: null, skills: null,
    claudeHome: { serverDir: '/h', visibleDir: '/home/appuser' }, runStaging: { serverDir: '/s', visibleDir: '/run/staging' }, workingTreeDir: '/w',
    abortSignal: new AbortController().signal,
    ...over,
  }
}

export function memoryStore(rows: Record<string, { harnessSessionId: string | null; title: string | null }> = {}): HarnessSessionStore & { rows: typeof rows } {
  return {
    rows,
    read: async id => rows[id] ?? null,
    write: async (id, harnessSessionId) => { rows[id] = { ...(rows[id] ?? { title: null }), harnessSessionId } },
  }
}

/** A server that runs each turn by emitting a scripted stream once the message is accepted. */
export function scripted(script: (relay: FakeRelay, call: Call) => void, extra?: (c: Call) => ReturnType<Parameters<typeof fakeDeps>[0]>) {
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

export const replyAndIdle = (relay: FakeRelay) => {
  relay.emit({ type: 'message.updated', properties: { sessionID: 'ses_new', info: { id: 'm2', sessionID: 'ses_new', role: 'assistant', providerID: 'openrouter', modelID: 'qwen/qwen3.8-27b:free' } } })
  relay.emit({ type: 'message.part.updated', properties: { sessionID: 'ses_new', part: { id: 'p1', sessionID: 'ses_new', messageID: 'm2', type: 'text', text: 'PERSIMMON-42' } } })
  relay.emit({ type: 'session.idle', properties: { sessionID: 'ses_new' } })
}

export async function collect(it: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const e of it) out.push(e)
  return out
}
