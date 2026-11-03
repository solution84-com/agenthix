/**
 * One `claude` process per conversation (spec §1, plan 5.21–5.24): turns are
 * pushed into the running process, what is per turn is applied per turn, and
 * the process is replaced when what it was started with no longer matches.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { PLAIN_TEXT_LINE } from '../pickedSkill'
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))
vi.mock('#db', () => ({ prisma: { toolCallLog: { create: vi.fn().mockResolvedValue({}) } } }))
vi.mock('../skillStaging', () => ({ stageSkills: vi.fn(async () => ({ staged: [], refused: [] })) }))
vi.mock('../landlockCheck', () => ({ requireLandlock: vi.fn(async () => {}) }))
vi.mock('../DockerSpawner', () => ({
  spawnDockerClaude: vi.fn(() => ({ once: vi.fn((_event: string, onExit: () => void) => onExit()), stderr: null })),
}))
// The relay tokens processes are issued, as issued.
const issued = vi.hoisted(() => [] as string[])
vi.mock('../../../server/modelRelay/relayTokens', async importOriginal => {
  const real = await importOriginal<typeof import('../../../server/modelRelay/relayTokens')>()
  return { ...real, issueRelayToken: (...args: Parameters<typeof real.issueRelayToken>) => { const t = real.issueRelayToken(...args); issued.push(t); return t } }
})
vi.mock('../claude/claudeProcessProbe', () => ({
  claudeProcessMemoryMb: vi.fn().mockResolvedValue(300),
  killClaudeProcess: vi.fn().mockResolvedValue(0),
  harnessMemoryCeilingMb: vi.fn(() => 1024),
}))

import { query } from '@anthropic-ai/claude-agent-sdk'
import { spawnDockerClaude } from '../DockerSpawner'
import { requireLandlock } from '../landlockCheck'
import { ClaudeSDKRuntime } from '../ClaudeSDKRuntime'
import { stageSkills } from '../skillStaging'
import { claudeProcessMemoryMb } from '../claude/claudeProcessProbe'
import { claudeProcessFor, liveClaudeProcessCount } from '../claude/claudeProcesses'
import { RUN_STOPPED_TEXT } from '../toolGate'
import { resolveConversationToken } from '../../../server/runtime/conversationTokens'
import { redeemClaudeKeyTicket } from '../../../server/runtime/claudeKeyTickets'
import { resolveRelayToken } from '../../../server/modelRelay/relayTokens'
import type { RunContext, RunEvent } from '../types'
import { fakeClaudeQueries, type FakeClaudeQuery } from './fakeClaudeQuery'
import { claudeTestContext } from './claudeTestContext'

let home: string
const runtime = new ClaudeSDKRuntime()

async function turn(overrides: Partial<RunContext> = {}): Promise<RunEvent[]> {
  const context = claudeTestContext({ claudeHome: { serverDir: home, visibleDir: home }, ...overrides })
  const events: RunEvent[] = []
  for await (const e of runtime.run(context)) events.push(e)
  return events
}

const statusOf = (events: RunEvent[]) => events.find(e => e.type === 'status')

function useFake(script?: Parameters<typeof fakeClaudeQueries>[0]) {
  const fake = fakeClaudeQueries(script)
  vi.mocked(query).mockImplementation(fake.start)
  return fake
}

const optionsOf = (q: FakeClaudeQuery) => q.options as Record<string, any>

/** The environment the process's `docker exec` is given, as the SDK would start it. */
function execEnvOf(q: FakeClaudeQuery): Record<string, string> {
  optionsOf(q).spawnClaudeCodeProcess({ command: 'claude', args: [], cwd: '/projects/web/files', env: {}, signal: new AbortController().signal })
  return vi.mocked(spawnDockerClaude).mock.calls.at(-1)![1] as Record<string, string>
}

describe('one claude process per conversation', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.SITE_AGENT_URL = 'http://site.test'
    vi.mocked(claudeProcessMemoryMb).mockResolvedValue(300)
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-home-'))
  })
  afterEach(async () => {
    await runtime.endConversation({ sessionId: 'session-1', containerName: null })
    await fs.rm(home, { recursive: true, force: true })
  })

  it('starts no claude process in a container whose kernel cannot contain its commands', async () => {
    useFake()
    vi.mocked(requireLandlock).mockRejectedValueOnce(new Error('Landlock ABI 5 is below 6'))
    await expect(turn({ containerName: 'agenthix-c1' })).rejects.toThrow(/Landlock/)
    expect(query).not.toHaveBeenCalled()
  })

  it('pushes a second turn into the process the first started', async () => {
    const fake = useFake()
    await turn({ runId: 'run-1', prompt: 'first' })
    await turn({ runId: 'run-2', prompt: 'second', isNewSession: false })

    expect(query).toHaveBeenCalledTimes(1)
    expect(fake.started[0]!.turns).toEqual(['first', 'second'])
    expect(liveClaudeProcessCount()).toBe(1)
  })

  it("replies with the CLI's own answer when a turn reached no model, and only then", async () => {
    const fake = useFake((_turn, text) => text.endsWith('/nope')
      ? [{ type: 'result', subtype: 'success', num_turns: 0, result: 'Unknown command: /nope' }]
      : [
          { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } } },
          { type: 'result', subtype: 'success', num_turns: 1, result: 'hi' },
        ])
    const local = await turn({ prompt: '/nope' })
    const answered = await turn({ runId: 'run-2', prompt: 'hello', isNewSession: false })

    // What a person types is never a command: the process is given it after a line saying it is plain text.
    expect(fake.started[0]!.turns[0]).toBe(`${PLAIN_TEXT_LINE}\n\n/nope`)
    expect(local.filter(e => e.type === 'text_delta')).toEqual([{ type: 'text_delta', textDelta: 'Unknown command: /nope' }])
    expect(statusOf(local)).toMatchObject({ status: 'completed' })
    expect(answered.filter(e => e.type === 'text_delta')).toEqual([{ type: 'text_delta', textDelta: 'hi' }])
  })

  it("shows the CLI's retries of a failing model request, and after three interrupts the turn and fails with the reason", async () => {
    const apiRetry = (attempt: number) => ({
      type: 'system', subtype: 'api_retry', attempt, max_retries: 10, retry_delay_ms: 2_000, error_status: 429, error: 'rate_limit',
    })
    const fake = useFake(() => [apiRetry(1), apiRetry(2), apiRetry(3), apiRetry(4), { type: 'result', subtype: 'error_during_execution', errors: ['interrupted'] }])
    const events = await turn()

    expect(events.filter(e => e.type === 'notice')).toEqual([1, 2, 3].map(n => (
      { type: 'notice', notice: `The provider is rate-limiting this model; retrying (attempt ${n})…` }
    )))
    expect(fake.started[0]!.calls.interrupt).toBe(1)
    expect(statusOf(events)).toEqual({ type: 'status', status: 'failed', error: 'The model provider was still failing after 3 retries: 429 rate_limit' })
  })

  it('fails a turn the CLI ended on an API error with its own words, and hints at the credential only for a refusal', async () => {
    useFake((_turn, text) => [{
      type: 'result', subtype: 'success', is_error: true, num_turns: text === 'a' ? 0 : 1,
      api_error_status: text === 'a' ? 429 : 401,
      result: text === 'a' ? 'API Error: 429 rate limited' : 'Invalid API key · Please run /login',
    }])
    const limited = await turn({ prompt: 'a' })
    const refused = await turn({ runId: 'run-2', prompt: 'b', isNewSession: false })

    expect(limited.filter(e => e.type === 'text_delta')).toEqual([])
    expect(statusOf(limited)).toEqual({ type: 'status', status: 'failed', error: 'API Error: 429 rate limited' })
    expect(statusOf(refused)).toEqual({
      type: 'status', status: 'failed',
      error: 'Invalid API key · Please run /login. Check that the credential for this provider is set up correctly.',
    })
  })

  it('sets the model per turn, and records the model the process reports', async () => {
    // The CLI renames a retired id: what it reports is what ran.
    const fake = useFake((_turn, _text, q) => [{ type: 'system', subtype: 'init', model: q.model === 'claude-opus-4-1' ? 'claude-opus-4-7' : q.model }])
    const first = await turn({ model: 'claude-sonnet-4-6' })
    const second = await turn({ runId: 'run-2', model: 'claude-opus-4-1', isNewSession: false })

    expect(fake.started).toHaveLength(1)
    expect(fake.started[0]!.calls.setModel).toBe(1)
    expect(statusOf(first)).toMatchObject({ status: 'completed', model: 'claude-sonnet-4-6' })
    expect(statusOf(second)).toMatchObject({ status: 'completed', model: 'claude-opus-4-7' })
  })

  it('replaces the process when the tool list changes, and the new one resumes', async () => {
    const fake = useFake()
    await turn({ bypassed: true })
    await turn({ runId: 'run-2', isNewSession: false, bypassed: false, allowedTools: [{ name: 'read_file', state: 'always' }] })

    expect(fake.started).toHaveLength(2)
    expect(fake.started[0]!.ended).toBe(true)
    expect(optionsOf(fake.started[1]!)).toMatchObject({ resume: 'session-1' })
    expect(optionsOf(fake.started[1]!).tools).toEqual(['Read', 'TodoWrite', 'Skill'])
  })

  it('replaces the process when the system prompt changes', async () => {
    const fake = useFake()
    await turn()
    await turn({ runId: 'run-2', isNewSession: false, agent: { ...claudeTestContext().agent, systemPrompt: 'Something else.' } })

    expect(fake.started).toHaveLength(2)
  })

  it('keeps the process when the API key changes, since the relay adds each turn\'s key', async () => {
    const fake = useFake()
    await turn({ credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'key-a' } })
    await turn({ runId: 'run-2', isNewSession: false, credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'key-b' } })
    expect(fake.started).toHaveLength(1)
  })

  it('keeps the process while its skills are unchanged, and replaces it when one changes', async () => {
    let body = 'v1'
    vi.mocked(stageSkills).mockImplementation(async (_inputs, to) => {
      const dest = typeof to === 'string' ? to : to.real
      await fs.mkdir(path.join(dest, 'org-x'), { recursive: true })
      await fs.writeFile(path.join(dest, 'org-x', 'SKILL.md'), body)
      return { staged: [{ source: 'org', slug: 'x', name: 'org-x', fingerprint: 'f', userInvocable: true, modelInvocable: true }], refused: [] }
    })
    const fake = useFake()
    await turn()
    await turn({ runId: 'run-2', isNewSession: false })
    expect(fake.started).toHaveLength(1)
    // The second turn's copy is gone; the process's own is kept.
    expect(await fs.readdir(path.join(home, '.tmp'))).toHaveLength(1)

    body = 'v2'
    await turn({ runId: 'run-3', isNewSession: false })
    expect(fake.started).toHaveLength(2)
    expect(optionsOf(fake.started[1]!).additionalDirectories).not.toEqual(optionsOf(fake.started[0]!).additionalDirectories)
    // The replaced process's folder went with it.
    expect(await fs.readdir(path.join(home, '.tmp'))).toHaveLength(1)
    vi.mocked(stageSkills).mockImplementation(async () => ({ staged: [], refused: [] }))
  })

  it('measures memory after a turn, not at the start of the next', async () => {
    const fake = useFake()
    await turn({ containerName: 'c1' })
    await vi.waitFor(() => expect(claudeProcessMemoryMb).toHaveBeenCalledWith({ containerName: 'c1', conversationId: 'session-1' }))
    vi.mocked(claudeProcessMemoryMb).mockClear()

    // A probe still in flight at the next turn's start is not waited for.
    vi.mocked(claudeProcessMemoryMb).mockReturnValue(new Promise(() => {}))
    await turn({ runId: 'run-2', isNewSession: false, containerName: 'c1' })
    expect(fake.started).toHaveLength(1)
    expect(claudeProcessMemoryMb).toHaveBeenCalledTimes(1)
    await turn({ runId: 'run-3', isNewSession: false, containerName: 'c1' })
    expect(claudeProcessMemoryMb).toHaveBeenCalledTimes(1)
  })

  it('replaces a process at the next turn when its stored figure is above the memory ceiling', async () => {
    vi.mocked(claudeProcessMemoryMb).mockResolvedValue(2000)
    const fake = useFake()
    await turn({ containerName: 'c1' })
    // The first turn found no figure: the process is under the ceiling until measured.
    expect(fake.started).toHaveLength(1)
    await vi.waitFor(() => expect(claudeProcessFor('session-1')?.lastMemoryMb).toBe(2000))

    await turn({ runId: 'run-2', isNewSession: false, containerName: 'c1' })
    expect(fake.started).toHaveLength(2)
  })

  it('ignores a measurement that finishes after the process ended', async () => {
    let finish: (mb: number) => void = () => {}
    vi.mocked(claudeProcessMemoryMb).mockReturnValue(new Promise(resolve => { finish = resolve }))
    useFake()
    await turn({ containerName: 'c1' })
    const first = claudeProcessFor('session-1')!
    void first.close()
    finish(2000)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(first.lastMemoryMb).toBeNull()
  })

  it('stops a cancelled turn with interrupt and keeps the process for the next', async () => {
    const controller = new AbortController()
    const fake = useFake(t => {
      if (t === 1) { setTimeout(() => controller.abort(), 5); return 'hang' }
      return []
    })
    await turn({ abortSignal: controller.signal })
    const next = await turn({ runId: 'run-2', isNewSession: false })

    expect(fake.started).toHaveLength(1)
    expect(fake.started[0]!.calls.interrupt).toBeGreaterThanOrEqual(1)
    expect(statusOf(next)).toMatchObject({ status: 'completed' })
  })

  it('starts a new process, resuming, when the last one ended between turns', async () => {
    const fake = useFake()
    await turn()
    fake.started[0]!.die()
    await turn({ runId: 'run-2', isNewSession: false })

    expect(fake.started).toHaveLength(2)
    expect(optionsOf(fake.started[1]!)).toMatchObject({ resume: 'session-1' })
  })

  it('replaces the process after a failed turn', async () => {
    const fake = useFake(t => t === 1 ? [{ type: 'result', subtype: 'error_during_execution', errors: ['401'] }] : [])
    const failed = await turn()
    await turn({ runId: 'run-2', isNewSession: false })

    expect(statusOf(failed)).toMatchObject({ status: 'failed' })
    expect(fake.started).toHaveLength(2)
  })

  it('ends the process when the conversation goes idle; the next turn resumes', async () => {
    const fake = useFake()
    await turn()
    await runtime.conversationIdle({ sessionId: 'session-1', containerName: null })
    expect(fake.started[0]!.ended).toBe(true)
    expect(liveClaudeProcessCount()).toBe(0)

    await turn({ runId: 'run-2', isNewSession: false })
    expect(optionsOf(fake.started[1]!)).toMatchObject({ resume: 'session-1' })
  })

  it('refuses a tool call that arrives between turns', async () => {
    const fake = useFake()
    await turn()
    const hook = optionsOf(fake.started[0]!).hooks.PreToolUse[0].hooks[0]

    expect(await hook({ tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 't1' })).toEqual({ decision: 'block', reason: RUN_STOPPED_TEXT })
  })

  it("starts the process with the conversation's token, pointed at each turn and at nothing between", async () => {
    const fake = useFake()
    const platform = { platform: { type: 'http' as const, url: 'http://site/mcp', headers: { Authorization: 'Bearer ${SITE_MCP_KEY}' } } }
    const holder = { jwt: 'jwt', expiresAt: Date.now() + 60_000 }
    await turn({ capability: holder, mcpServers: platform, gitCredEnv: { SITE_MCP_KEY: 'run-token-1' } })
    await turn({ runId: 'run-2', isNewSession: false, capability: holder, mcpServers: platform, gitCredEnv: { SITE_MCP_KEY: 'run-token-2' } })

    expect(fake.started).toHaveLength(1)
    expect(optionsOf(fake.started[0]!).mcpServers.platform.headers.Authorization).toBe('Bearer ${SITE_MCP_KEY}')
    const token: string = optionsOf(fake.started[0]!).env.SITE_MCP_KEY
    expect(token).not.toContain('run-token')
    expect(resolveConversationToken(token)).toBeNull()
  })

  it("gives the key, the tag and the command launcher to the process's own exec, in a container", async () => {
    vi.mocked(stageSkills).mockImplementation(async (_inputs, to) => {
      const dest = typeof to === 'string' ? to : to.real
      await fs.mkdir(path.join(dest, 'org-x'), { recursive: true })
      await fs.writeFile(path.join(dest, 'org-x', 'SKILL.md'), 'x')
      return { staged: [{ source: 'org', slug: 'x', name: 'org-x', fingerprint: 'f', userInvocable: true, modelInvocable: true }], refused: [] }
    })
    const fake = useFake()
    await turn({ containerName: 'c1', credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-run' }, gitCredEnv: { AGENT_HANDLE: 'coder', USE_BUILTIN_RIPGREP: '1' } })
    vi.mocked(stageSkills).mockImplementation(async () => ({ staged: [], refused: [] }))

    const env = execEnvOf(fake.started[0]!)
    expect(env).toMatchObject({
      SITE_SESSION: 'session-1',
      CLAUDE_CODE_SHELL_PREFIX: '/usr/local/lib/agenthix/bin/claude-shell-prefix',
      // Grep and Glob run the image's rg, which runs the real one through the launcher.
      USE_BUILTIN_RIPGREP: '0',
      SITE_COMMAND_READABLE: optionsOf(fake.started[0]!).additionalDirectories[0],
      AGENT_HANDLE: 'coder',
    })
    // The key never enters the container: the process's requests go to the
    // site's model relay, and it trades a one-use ticket, through Claude
    // Code's apiKeyHelper, for a relay token it sends as its key.
    expect(Object.values(env)).not.toContain('sk-run')
    expect(optionsOf(fake.started[0]!).env.ANTHROPIC_API_KEY).not.toBe('sk-run')
    expect(env.ANTHROPIC_BASE_URL).toBe('http://site.test/api/v1/model-relay/anthropic')
    expect(optionsOf(fake.started[0]!).settings.apiKeyHelper).toBe(
      `curl -fsS --max-time 10 -X POST -H "Authorization: Bearer $SITE_HARNESS_KEY" 'http://site.test/api/v1/harness/claude-key'`,
    )
    expect(Number(env.CLAUDE_CODE_API_KEY_HELPER_TTL_MS)).toBeGreaterThan(24 * 3600_000)
    const ticket = env.SITE_HARNESS_KEY!
    const relayToken = redeemClaudeKeyTicket(ticket)!
    expect(relayToken).toMatch(/^[\w-]{40,}$/)
    expect(relayToken).not.toBe('sk-run')
    expect(redeemClaudeKeyTicket(ticket)).toBeNull()
  })

  it('points the process\'s relay token at each turn while it runs, with every provider the turn may use, and at nothing between turns', async () => {
    const seen: Array<ReturnType<typeof resolveRelayToken>> = []
    issued.length = 0
    const fake = useFake(() => {
      seen.push(resolveRelayToken(issued[0]!))
      return []
    })
    const key = { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-run' } as const
    await turn({ runId: 'run-1', containerName: 'c1', credential: key })
    const relayToken = issued[0]!
    expect(resolveRelayToken(relayToken)).toBeNull()
    await turn({ runId: 'run-2', isNewSession: false, containerName: 'c1', credential: key })

    expect(fake.started).toHaveLength(1)
    expect(seen.map(t => t && { runId: t.runId, containerName: t.containerName, conversationId: t.conversationId })).toEqual([
      { runId: 'run-1', containerName: 'c1', conversationId: 'session-1' },
      { runId: 'run-2', containerName: 'c1', conversationId: 'session-1' },
    ])
    expect(seen[0]!.credentials.get('anthropic')).toEqual(key)
    expect(resolveRelayToken(relayToken)).toBeNull()
  })

  it('revokes the relay token when the process closes', async () => {
    issued.length = 0
    const fake = useFake()
    await turn({ containerName: 'c1', credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-run' } })
    const [relayToken] = issued
    // The ticket trades for this process's own token.
    expect(redeemClaudeKeyTicket(execEnvOf(fake.started[0]!).SITE_HARNESS_KEY!)).toBe(relayToken)
    await runtime.endConversation({ sessionId: 'session-1', containerName: 'c1' })
    // Revoked, it cannot be pointed at a turn again; a new process gets a new one.
    await turn({ runId: 'run-2', containerName: 'c1', credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-run' } })
    expect(fake.started).toHaveLength(2)
    expect(issued).toHaveLength(2)
    expect(issued[1]).not.toBe(relayToken)
    const { pointRelayToken } = await import('../../../server/modelRelay/relayTokens')
    expect(() => pointRelayToken(relayToken!, 'run-3', [])).toThrow(/revoked/)
  })

  it('drops an unused ticket when its process closes', async () => {
    const fake = useFake()
    await turn({ containerName: 'c1', credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-run' } })
    const ticket = execEnvOf(fake.started[0]!).SITE_HARNESS_KEY!
    await runtime.endConversation({ sessionId: 'session-1', containerName: 'c1' })

    expect(redeemClaudeKeyTicket(ticket)).toBeNull()
  })

  it('gives a subscription run no helper, no ticket and no relay: it talks to Anthropic directly', async () => {
    const fake = useFake()
    await turn({ containerName: 'c1', credential: { kind: 'subscription', provider: 'anthropic', oauthJson: '{}', grantId: 'grant-1', loginId: 'login-1' } })

    expect(optionsOf(fake.started[0]!).settings.apiKeyHelper).toBeUndefined()
    const env = execEnvOf(fake.started[0]!)
    expect(env.SITE_HARNESS_KEY).toBeUndefined()
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
  })
})
