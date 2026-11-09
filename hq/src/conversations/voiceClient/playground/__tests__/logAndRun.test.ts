/**
 * The Log's pure parts (plan task 4c.2): the sounds read from the voice runtime's events, the decisions, the order
 * and the filters; and the scenario run as the page shows it (4c.4): scores, marks, the estimate and the cost.
 */
import { describe, expect, it } from 'vitest'
import type { ModelPricing } from '@agenthix/core'
import type { VoiceEvent } from '../../events'
import type { ScenarioLibrary, ScenarioResult } from '../../../../shared/voicePlayground'
import { createSoundReader, decisionEntries, logView, messageEntries, type LogEntry } from '../playgroundLog'
import { NO_RUN, cellOf, estimate, groupScore, resultKey, runCost, runLogEntries, totalScore, type RunState } from '../scenarioRun'

let seq = 0
const ev = (t: number, body: Record<string, unknown>) => ({ t, seq: seq++, ...body }) as unknown as VoiceEvent

describe('the sounds in the Log', () => {
  it('names each stored clip by what the listening family asked for, once as it starts, with how far into the turn', () => {
    const played: unknown[] = []
    const read = createSoundReader(() => 50_000, p => played.push(p))
    const events = [
      ev(1_000, { kind: 'orchestration.floor', state: 'person-speaking' }),
      ev(12_000, { kind: 'orchestration.phrase', tiers: ['hum'] }),
      ev(13_000, { kind: 'phrase.at', text: 'Mm-hm.', playing: true }),
      ev(13_100, { kind: 'phrase.at', text: 'Mm-hm.', playing: true }),
      ev(13_400, { kind: 'phrase.at', text: 'Mm-hm.', playing: false }),
      ev(20_000, { kind: 'orchestration.phrase', tiers: ['invitation'] }),
      ev(21_000, { kind: 'phrase.at', text: 'Go on.', playing: true }),
      ev(22_000, { kind: 'phrase.at', text: 'Go on.', playing: false }),
      ev(30_000, { kind: 'orchestration.floor', state: 'agent-thinking' }),
      ev(33_000, { kind: 'phrase.at', text: 'One moment.', playing: true }),
    ]
    const sounds = events.map(read).filter((e): e is LogEntry => e !== null)
    expect(sounds.map(s => [s.badge, s.title, s.after])).toEqual([
      ['HUM', '“Mm-hm.”', '12 s into your turn'],
      ['INVITE', '“Go on.”', '20 s into your turn'],
      ['PHRASE', '“One moment.”', undefined],
    ])
    expect(played).toEqual([{ text: 'Mm-hm.', sound: 'hum' }, { text: 'Go on.', sound: 'invitation' }, { text: 'One moment.', sound: 'phrase' }])
  })
})

describe('the conversation in the Log', () => {
  it('lists what the person said and what the agent said, in order, and leaves out what was never heard', () => {
    const entries = [
      { id: 'p1', role: 'person', text: 'So what is the hum', at: 1_000, spoken: true },
      { id: 'a0', role: 'agent', text: '', withdrawn: true, at: 1_500 },
      { id: 'h', role: 'agent', text: 'Mm-hm.', sound: 'hum', at: 1_200 },
      { id: 'a1', role: 'agent', text: 'It is me.', at: 2_000, firstTextAt: 2_100, spoken: true },
      { id: 'p2', role: 'person', text: 'Typed this', at: 3_000 },
      { id: 'a2', role: 'agent', text: 'Wait, I', at: 3_500, spoken: true, interrupted: true },
      { id: 'a3', role: 'agent', text: 'Never heard', at: 4_000, withdrawn: true },
    ] as const
    const row = (turnId: string, at: number, outcome: string, detail = '', gap = '') => ({ turnId, said: '', outcome, detail, gap, at, held: outcome.startsWith('Held') })
    const rows = [row('t0', 1_500, 'Dropped (they went on)'), row('t1', 2_100, 'Plain reply', 'It is me.', '+1.10 s'), row('t2', 3_500, 'Plain reply', 'Wait, I', '+0.50 s'), row('t3', 4_000, 'Held, kept listening', 'ended on "to"', '+0.80 s')]
    const calls = [{ turnId: 't1', model: 'p1/flash', inputTokens: 3_300, outputTokens: 12 }]
    const turned = entries.map(e => ({ ...e, turnId: ({ a0: 't0', a1: 't1', a2: 't2', a3: 't3' } as Record<string, string>)[e.id] }))
    const list = messageEntries(turned, rows, calls, () => 'Flash')
    expect(list.map(e => [e.badge, e.title, e.after])).toEqual([
      ['YOU', '“So what is the hum”', 'spoken'],
      ['YOU', '“Typed this”', 'typed'],
      ['AGENT', 'Dropped (they went on)', undefined],
      ['AGENT', '“It is me.”', 'spoken · +1.10 s · Flash · 3,300 in · 12 out'],
      ['AGENT', '“Wait, I”', 'interrupted, the part heard · +0.50 s'],
      ['AGENT', 'Held, kept listening · “ended on "to"”', '+0.80 s'],
    ])
    expect(logView([list], 'conversation').length).toBe(6)
    expect(logView([list], 'calls').map(e => e.id)).toEqual(['turn-t1'])
    expect(logView([list], 'decisions')).toHaveLength(4)
  })
})

describe('the Log', () => {
  const at = (n: number, badge: LogEntry['badge']): LogEntry => ({ id: `${badge}${n}`, at: n, badge, title: badge })

  it('joins every list newest first, and each filter shows its badge only; All shows notices too', () => {
    const lists = [[at(1, 'DECISION'), at(5, 'CALL')], [at(3, 'HUM'), at(4, 'ERROR'), at(2, 'NOTICE')]]
    expect(logView(lists, 'all').map(e => e.at)).toEqual([5, 4, 3, 2, 1])
    expect(logView(lists, 'decisions').map(e => e.badge)).toEqual(['DECISION'])
    expect(logView(lists, 'sounds').map(e => e.badge)).toEqual(['HUM'])
    expect(logView(lists, 'calls').map(e => e.badge)).toEqual(['CALL'])
    expect(logView(lists, 'errors').map(e => e.badge)).toEqual(['ERROR'])
  })

  it('writes a decision with its reason and the seconds after the turn was sent', () => {
    const [e] = decisionEntries([{ turnId: 't1', said: 'Move it to', outcome: 'Held, kept listening', detail: 'ended on "to"', gap: '+0.80 s', at: 9, held: true }])
    expect(e).toEqual({ id: 'decision-t1', at: 9, badge: 'DECISION', title: 'Held, kept listening · “ended on "to"”', after: '+0.80 s' })
  })
})

const library: ScenarioLibrary = {
  inputTokensPerRun: 1_000_000,
  groups: [
    { id: 'hold', title: 'Trails off', scenarios: [{ id: 'a', wanted: 'hold', last: 'and', conversation: [] }, { id: 'b', wanted: 'hold', last: 'um', conversation: [] }] },
    { id: 'task', title: 'Tasks', scenarios: [{ id: 'c', wanted: 'task', last: 'Book it.', conversation: [] }] },
  ],
}
const r = (scenarioId: string, model: string, pass: boolean, extra: Partial<ScenarioResult> = {}) => ({
  runId: 'r', scenarioId, model, pass, did: pass ? 'held' : 'answered', wroteFirst: false, text: '', reason: null, calls: [],
  firstOutputMs: 900, inputTokens: 1_000, outputTokens: 100, at: 7, ...extra,
})
const runOf = (results: ReturnType<typeof r>[], endedAt: number | null = 8): RunState => ({
  ...NO_RUN, runId: 'r', models: ['p/a', 'p/b'], running: endedAt === null, endedAt,
  results: Object.fromEntries(results.map(x => [resultKey(x.scenarioId, x.model), x])),
})
const prices: Record<string, ModelPricing> = { 'p/a': { inputPerMTok: 1, outputPerMTok: 10, cacheReadPerMTok: 0, cacheWritePerMTok: 0 } }

describe('the scenario run on the page', () => {
  it('scores each group and the total per model, and marks each line', () => {
    const run = runOf([r('a', 'p/a', false), r('b', 'p/a', true), r('a', 'p/b', true)], null)
    expect(groupScore(library.groups[0]!, 'p/a', run)).toEqual({ passed: 1, done: 2, total: 2 })
    expect(groupScore(library.groups[0]!, 'p/b', run)).toEqual({ passed: 1, done: 1, total: 2 })
    expect(totalScore(library, 'p/a', run)).toBe(1)
    expect(cellOf(run.results[resultKey('a', 'p/a')], true)).toEqual({ mark: '✗', word: 'answered', pass: false })
    expect(cellOf(undefined, true)).toEqual({ mark: '…', word: 'waiting', pass: null })
    expect(cellOf(r('c', 'p/a', false, { error: 'No key', did: 'failed' }), false)).toMatchObject({ mark: '✗', word: 'failed' })
  })

  it('estimates calls as scenarios × models, and the cost only when every model has a known price', () => {
    const price = (m: string) => prices[m]
    expect(estimate(library, ['p/a'], price)).toEqual({ scenarios: 3, calls: 3, dollars: 1 + (3 * 60 * 10) / 1_000_000 })
    expect(estimate(library, ['p/a', 'p/b'], price)).toMatchObject({ calls: 6, dollars: null })
  })

  it('puts a decision per line and, once the run ends, one call for the run in the Log', () => {
    const run = runOf([r('a', 'p/a', true), r('a', 'p/b', false)])
    const entries = runLogEntries(library, run, m => m.toUpperCase(), m => prices[m])
    expect(entries.filter(e => e.badge === 'DECISION').map(e => [e.title, e.after])).toEqual([['P/A · “and” → kept listening', 'pass'], ['P/B · “and” → answered', 'fail']])
    expect(entries.find(e => e.badge === 'CALL')?.title).toBe('2 calls · 2,000 in · 200 out')
    expect(runCost(runOf([r('a', 'p/a', true)]), m => prices[m])).toBeCloseTo(0.002)
    expect(runLogEntries(library, NO_RUN, m => m)).toEqual([])
  })
})
