import { describe, it, expect } from 'vitest'
import { plainFailureReason } from '@agenthix/core'
import { OpenCodeTurnTranslator, CONTEXT_FULL_NOTICE } from '../openCodeTranslate'
import type { OpenCodeEvent } from '../openCodeEvents'
import type { RunEvent } from '../../types'

const S = 'ses_1'
const CONN = 'agx0123456789ab'
const msg = (id: string, role: 'user' | 'assistant', extra: Record<string, unknown> = {}): OpenCodeEvent =>
  ({ type: 'message.updated', properties: { sessionID: S, info: { id, sessionID: S, role, ...extra } } }) as OpenCodeEvent
const part = (p: Record<string, unknown>): OpenCodeEvent =>
  ({ type: 'message.part.updated', properties: { sessionID: S, part: { sessionID: S, ...p } } }) as OpenCodeEvent
const delta = (partID: string, text: string): OpenCodeEvent =>
  ({ type: 'message.part.delta', properties: { sessionID: S, messageID: 'm2', partID, field: 'text', delta: text } }) as OpenCodeEvent
const idle: OpenCodeEvent = { type: 'session.idle', properties: { sessionID: S } }
const retry = (attempt: number, message: string, next: number): OpenCodeEvent =>
  ({ type: 'session.status', properties: { sessionID: S, status: { type: 'retry', attempt, message, next } } })

function run(events: OpenCodeEvent[]): { out: RunEvent[]; t: OpenCodeTurnTranslator } {
  const t = new OpenCodeTurnTranslator(CONN)
  return { out: events.flatMap(e => t.translate(e)), t }
}

describe('translating a turn', () => {
  it('streams the reply and never the person\'s own message', () => {
    const { out, t } = run([
      msg('m1', 'user'),
      part({ id: 'p0', messageID: 'm1', type: 'text', text: 'hello there' }),
      msg('m2', 'assistant', { providerID: 'openrouter', modelID: 'qwen/qwen3.8-27b:free' }),
      part({ id: 'p1', messageID: 'm2', type: 'text', text: '' }),
      delta('p1', 'Hel'),
      delta('p1', 'lo'),
      part({ id: 'p1', messageID: 'm2', type: 'text', text: 'Hello!' }),
      idle,
    ])
    expect(out).toEqual([
      { type: 'text_delta', textDelta: 'Hel' },
      { type: 'text_delta', textDelta: 'lo' },
      { type: 'text_delta', textDelta: '!' },
    ])
    expect(t.done).toBe(true)
    expect(t.finish()).toEqual({ type: 'status', status: 'completed', model: 'openrouter/qwen/qwen3.8-27b:free' })
  })

  it('separates text parts around a tool call with one paragraph break, streamed as stored', () => {
    const tool = (state: Record<string, unknown>) =>
      part({ id: 't1', messageID: 'm2', type: 'tool', callID: 'c1', tool: 'read', state })
    const { out } = run([
      msg('m2', 'assistant'),
      part({ id: 'p1', messageID: 'm2', type: 'text', text: '' }),
      delta('p1', 'Checking '),
      delta('p1', 'for tasks. '),
      part({ id: 'p1', messageID: 'm2', type: 'text', text: 'Checking for tasks. ' }),
      tool({ status: 'running', input: {} }),
      tool({ status: 'completed', input: {}, output: 'ok' }),
      part({ id: 'p2', messageID: 'm2', type: 'text', text: '' }),
      delta('p2', 'No queued '),
      delta('p2', 'tasks.'),
      part({ id: 'p2', messageID: 'm2', type: 'text', text: 'No queued tasks.' }),
      part({ id: 'p3', messageID: 'm2', type: 'text', text: 'Done.' }),
    ])
    const text = out.flatMap(e => (e.type === 'text_delta' ? [e.textDelta] : []))
    expect(text).toEqual(['Checking ', 'for tasks. ', '\n\nNo queued ', 'tasks.', '\n\nDone.'])
    expect(text.join('')).toBe('Checking for tasks. \n\nNo queued tasks.\n\nDone.')
  })

  it('streams reasoning as thinking and skips OpenCode\'s own synthetic text', () => {
    const { out } = run([
      msg('m2', 'assistant'),
      part({ id: 'r1', messageID: 'm2', type: 'reasoning', text: '' }),
      delta('r1', 'think'),
      part({ id: 'x', messageID: 'm2', type: 'text', text: 'reminder', synthetic: true }),
    ])
    expect(out).toEqual([{ type: 'thinking', thinking: 'think' }])
  })

  it('announces a tool call once its arguments are known, and its result, with a platform tool by its own name', () => {
    const tool = (state: Record<string, unknown>, name = 'bash') => part({ id: 't1', messageID: 'm2', type: 'tool', tool: name, callID: 'call-9', state })
    const { out } = run([
      msg('m2', 'assistant'),
      tool({ status: 'pending', input: {} }),
      tool({ status: 'running', input: { command: 'ls' }, time: { start: 1 } }),
      tool({ status: 'running', input: { command: 'ls' }, time: { start: 1 } }),
      tool({ status: 'completed', input: { command: 'ls' }, output: 'a\nb', title: 'ls', time: { start: 1, end: 2 } }),
      part({ id: 't2', messageID: 'm2', type: 'tool', tool: `${CONN}_create_task`, callID: 'c2', state: { status: 'error', input: { title: 'x' }, error: 'Refused: ask the person', time: { start: 1, end: 2 } } }),
    ])
    expect(out).toEqual([
      { type: 'tool_call', toolUseId: 'call-9', toolName: 'bash', toolInput: { command: 'ls' } },
      { type: 'tool_result', toolUseId: 'call-9', output: 'a\nb' },
      { type: 'tool_call', toolUseId: 'c2', toolName: 'create_task', toolInput: { title: 'x' } },
      { type: 'tool_result', toolUseId: 'c2', output: 'Refused: ask the person' },
    ])
  })

  it('sums the tokens of every step', () => {
    const step = (id: string, input: number, output: number, read: number) =>
      part({ id, messageID: 'm2', type: 'step-finish', reason: 'tool-calls', cost: 0, tokens: { input, output, reasoning: 1, cache: { read, write: 2 } } })
    const { t } = run([msg('m2', 'assistant'), step('s1', 10, 5, 100), step('s2', 20, 7, 200), idle])
    expect(t.finish()).toMatchObject({
      status: 'completed',
      usage: { inputTokens: 30, outputTokens: 14, cacheReadTokens: 300, cacheWriteTokens: 4, totalTokens: 348 },
    })
  })

  it('announces each step as one round trip with the model, once however often the part updates', () => {
    const step = (id: string) => part({ id, messageID: 'm2', type: 'step-finish', reason: 'tool-calls', cost: 0, tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } } })
    const { out } = run([msg('m2', 'assistant'), step('s1'), step('s1'), step('s2'), idle])
    expect(out.filter(e => e.type === 'model_round_trip')).toHaveLength(2)
  })

  it('fails a turn OpenCode reported an error for, in words a person can read', () => {
    const { t } = run([
      msg('m2', 'assistant', { error: { name: 'ProviderAuthError', data: { message: 'OpenRouter API key is missing' } } }),
      idle,
    ])
    expect(t.finish()).toEqual({ type: 'status', status: 'failed', error: 'The model provider refused the credential: OpenRouter API key is missing. Check that the credential for this provider is set up correctly.' })
    const { t: t2 } = run([{ type: 'session.error', properties: { sessionID: S, error: { name: 'APIError', data: { statusCode: 429, message: 'rate-limited' } } } }, idle])
    expect(t2.finish()).toEqual({ type: 'status', status: 'failed', error: 'The model provider answered 429: rate-limited' })
  })

  it('reads an abort as a cancel, and a server gone mid-turn as a failure', () => {
    const { t } = run([{ type: 'session.error', properties: { sessionID: S, error: { name: 'MessageAbortedError', data: {} } } }, idle])
    expect(t.finish()).toMatchObject({ status: 'cancelled' })
    const { t: t2 } = run([msg('m2', 'assistant')])
    expect(t2.finish('the OpenCode server stopped during the turn')).toEqual({
      type: 'status', status: 'failed', error: 'The turn ended because the OpenCode server stopped during the turn.',
    })
  })

  it('shows each of OpenCode\'s own retries, and keeps the turn going', () => {
    const t = new OpenCodeTurnTranslator(CONN, () => 1_000)
    const out = t.translate(retry(1, 'Rate limit exceeded: free-models-per-min', 3_000))
    expect(out).toEqual([{ type: 'notice', notice: 'The provider is rate-limiting this model; retrying (attempt 1)…' }])
    expect(t.translate(retry(2, 'Provider is overloaded', 5_000))).toEqual([
      { type: 'notice', notice: 'The model provider failed (Provider is overloaded); retrying (attempt 2)…' },
    ])
    expect(t.done).toBe(false)
    expect(t.gaveUp).toBeUndefined()
  })

  it('gives up after three retries with the provider\'s own reason, even once the abort that follows is reported', () => {
    const t = new OpenCodeTurnTranslator(CONN, () => 1_000)
    for (const n of [1, 2, 3]) t.translate(retry(n, 'Rate limit exceeded: free-models-per-min', 2_000))
    expect(t.gaveUp).toBeUndefined()
    expect(t.translate(retry(4, 'Rate limit exceeded: free-models-per-min', 2_000))).toEqual([])
    expect(t.gaveUp).toBe('The model provider was still failing after 3 retries: Rate limit exceeded: free-models-per-min')
    t.translate({ type: 'session.error', properties: { sessionID: S, error: { name: 'MessageAbortedError', data: {} } } })
    expect(t.finish()).toEqual({ type: 'status', status: 'failed', error: t.gaveUp })
  })

  it('gives up at once when the provider asks for a wait longer than a minute', () => {
    const t = new OpenCodeTurnTranslator(CONN, () => 1_000)
    t.translate(retry(1, 'Too Many Requests', 1_000 + 120_000))
    expect(t.gaveUp).toBe('The model provider asked to wait 120 s before trying again: Too Many Requests')
  })

  it('carries a provider\'s refusal of the key with the hint about keys, and any other failure without it', () => {
    const { t } = run([{ type: 'session.error', properties: { sessionID: S, error: { name: 'APIError', data: { statusCode: 401, message: 'User not found.' } } } }, idle])
    expect(t.finish()).toEqual({
      type: 'status', status: 'failed',
      error: 'The model provider answered 401: User not found. Check that the credential for this provider is set up correctly.',
    })
    const { t: t2 } = run([{ type: 'session.error', properties: { sessionID: S, error: { name: 'UnknownError', data: { message: 'boom' } } } }, idle])
    expect(t2.finish()).toEqual({ type: 'status', status: 'failed', error: 'UnknownError: boom' })
  })

  it('does not fail a turn OpenCode compacts and carries on after a context overflow', () => {
    const { out, t } = run([
      { type: 'session.error', properties: { sessionID: S, error: { name: 'ContextOverflowError', data: { message: 'too long' } } } },
      msg('m3', 'assistant'),
      part({ id: 'p9', messageID: 'm3', type: 'text', text: 'Done.' }),
      idle,
    ])
    expect(out).toEqual([{ type: 'notice', notice: CONTEXT_FULL_NOTICE }, { type: 'text_delta', textDelta: 'Done.' }])
    expect(t.finish()).toMatchObject({ status: 'completed' })
  })

  it('fails a turn whose overflow OpenCode could not recover from, in words the conversation can put plainly', () => {
    const { t } = run([msg('m3', 'assistant', { error: { name: 'ContextOverflowError', data: { message: 'prompt is too long' } } }), idle])
    const end = t.finish()
    expect(end).toMatchObject({ status: 'failed' })
    expect(plainFailureReason((end as { error: string }).error)).toBe("The agent's memory of this conversation was full.")
  })
})

describe("the session's memory", () => {
  const step = (id: string, messageID: string, tokens: Record<string, unknown>) =>
    part({ id, messageID, type: 'step-finish', reason: 'stop', cost: 0, tokens })

  it('is the last step\'s tokens, counted as OpenCode counts them', () => {
    const { t } = run([
      msg('m2', 'assistant'),
      step('s1', 'm2', { input: 100, output: 20, reasoning: 0, cache: { read: 9_000, write: 50 } }),
      step('s2', 'm2', { input: 200, output: 30, reasoning: 0, cache: { read: 9_100, write: 0 } }),
    ])
    expect(t.contextTokens).toBe(9_330)
  })

  it('keeps the summary out of the reply, and reports where it summarised', () => {
    const { out, t } = run([
      msg('m2', 'assistant'),
      step('s1', 'm2', { total: 180_000, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
      msg('m3', 'user'),
      part({ id: 'c1', messageID: 'm3', type: 'compaction', auto: false }),
      msg('m4', 'assistant', { summary: true }),
      part({ id: 'p4', messageID: 'm4', type: 'text', text: 'Avery is redesigning the project page.' }),
      step('s2', 'm4', { input: 180_000, output: 900, reasoning: 0, cache: { read: 0, write: 0 } }),
      { type: 'session.compacted', properties: { sessionID: S } },
      idle,
    ])
    expect(out.filter(e => e.type === 'text_delta')).toEqual([])
    expect(out.filter(e => e.type === 'compacted')).toEqual([
      { type: 'compacted', trigger: 'manual', summary: 'Avery is redesigning the project page.', tokensBefore: 180_000 },
    ])
    expect(t.contextTokens).toBe(900)
  })
})
