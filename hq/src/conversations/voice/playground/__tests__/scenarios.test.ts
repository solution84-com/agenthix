/**
 * The playground's scenario library and its runner (plan tasks 4c.3, 4c.4, 4c.6): the fixed library's shape; the
 * scoring of model steps as a model streams them; and the runner through the same lead path as Live, with a model
 * replaced only where the call would leave hq.
 */
import { describe, expect, it } from 'vitest'
import { PLAYGROUND_REFUSED, SCENARIO_CONCURRENCY, VOICE_PLAYGROUND_SOCKET as P, type ScenarioResult } from '../../../../shared/voicePlayground'
import type { LeadRequest, LeadStreamEvent, ModelAdapter } from '../../../contract'
import { KEEP_LISTENING } from '../../../lead/voiceLogic'
import { ALL_SCENARIOS, SCENARIO_GROUPS } from '../scenarios'
import { scoreStep } from '../scenarios/score'
import { ScenarioRunner, scenarioTurn } from '../scenarios/runner'
import { playgroundContext } from '../context'
import { fakeLead } from '../leads'
import { registerVoicePlayground, type PlaygroundSocket } from '../handlers'

const usage = { inputTokens: 3_410, outputTokens: 22, cacheReadTokens: 0, cacheWriteTokens: 0 }
const finish: LeadStreamEvent = { type: 'finish', reason: 'stop', usage }
const text = (t: string): LeadStreamEvent => ({ type: 'text', text: t })
const call = (name: string, input: unknown): LeadStreamEvent => ({ type: 'tool-call', call: { id: `c-${name}`, name, input } })

/** Steps as models wrote them in the voice turn checks, one of each shape. */
const STEPS = {
  held: [call(KEEP_LISTENING, { reason: 'Ended on "um", mid-thought' }), finish],
  heldAfterWords: [text('Take your time.'), call(KEEP_LISTENING, { reason: 'Ended on "and"' }), finish],
  answered: [text("Tuesday works. What are you looking to book, though?"), finish],
  quickWithTool: [text('Paris.'), call('start_work', { title: 'Look it up', brief: 'capital of France' }), finish],
  startsWork: [text("I'll book it and send the agenda."), call('start_work', { title: 'Book the design meeting', brief: 'x' }), finish],
  claimsDone: [text("Done, I've booked it."), finish],
  silent: [finish],
} satisfies Record<string, LeadStreamEvent[]>

describe('the scenario library', () => {
  it('holds 84 scenarios in four fixed groups of 22, 22, 20 and 20', () => {
    expect(SCENARIO_GROUPS.map(g => [g.id, g.scenarios.length])).toEqual([['hold', 22], ['reply', 22], ['quick', 20], ['task', 20]])
    expect(ALL_SCENARIOS).toHaveLength(84)
  })

  it('gives every scenario a stable id, a last line, the behaviour its group wants, and a conversation', () => {
    expect(new Set(ALL_SCENARIOS.map(s => s.id)).size).toBe(84)
    for (const g of SCENARIO_GROUPS) {
      for (const s of g.scenarios) {
        expect(s.wanted).toBe(g.id)
        expect(s.last.trim()).not.toBe('')
        expect(s.conversation.length).toBeGreaterThan(0)
        for (const [who, words] of s.conversation) { expect(['person', 'agent']).toContain(who); expect(words.trim()).not.toBe('') }
      }
    }
  })

  it('cannot be changed while hq runs', () => {
    const group = SCENARIO_GROUPS[0]!
    expect(Object.isFrozen(SCENARIO_GROUPS)).toBe(true)
    expect(() => { (group.scenarios as unknown as unknown[]).push({}) }).toThrow()
    expect(() => { (group.scenarios[0] as { last: string }).last = 'changed' }).toThrow()
    expect(group.scenarios[0]!.last).not.toBe('changed')
  })

  it('is sent as a spoken turn under the voice turn block, its last words the message answered', () => {
    const s = SCENARIO_GROUPS[0]!.scenarios[0]!
    const c = playgroundContext(scenarioTurn(s, true))
    expect(c.spokenMessage).toBe(true)
    expect(JSON.stringify(c.messages)).toContain(JSON.stringify(s.last).slice(1, 40))
    expect(JSON.stringify(c.messages)).toMatch(/First judge whether they have finished their thought/)
  })
})

describe('scoring a step against the behaviour wanted', () => {
  const outcome = (steps: LeadStreamEvent[]) => {
    const calls = steps.flatMap(e => (e.type === 'tool-call' ? [e.call.name] : []))
    const words = steps.flatMap(e => (e.type === 'text' ? [e.text] : [])).join('')
    return { held: calls.includes(KEEP_LISTENING), text: words, calls }
  }

  it('a trail-off passes on a hold, marked when it wrote words first, and fails on an answer', () => {
    expect(scoreStep('hold', outcome(STEPS.held))).toEqual({ pass: true, did: 'held', wroteFirst: false })
    expect(scoreStep('hold', outcome(STEPS.heldAfterWords))).toEqual({ pass: true, did: 'held', wroteFirst: true })
    expect(scoreStep('hold', outcome(STEPS.answered))).toEqual({ pass: false, did: 'answered', wroteFirst: false })
  })

  it('a finished turn passes on words and fails on a hold or on silence', () => {
    expect(scoreStep('reply', outcome(STEPS.answered)).pass).toBe(true)
    expect(scoreStep('reply', outcome(STEPS.held)).pass).toBe(false)
    expect(scoreStep('reply', outcome(STEPS.silent))).toMatchObject({ pass: false, did: 'said nothing' })
  })

  it('a quick question passes on words with no tool', () => {
    expect(scoreStep('quick', outcome(STEPS.answered)).pass).toBe(true)
    expect(scoreStep('quick', outcome(STEPS.quickWithTool))).toMatchObject({ pass: false, did: 'called start_work' })
  })

  it('a task passes only when it called start_work', () => {
    expect(scoreStep('task', outcome(STEPS.startsWork))).toMatchObject({ pass: true, did: 'called start_work' })
    expect(scoreStep('task', outcome(STEPS.claimsDone))).toMatchObject({ pass: false, did: 'answered' })
    expect(scoreStep('task', outcome(STEPS.held)).pass).toBe(false)
  })
})

const access = (value: string) => ({ providerId: 'p1', providerName: 'Test', provider: 'openrouter' as const, model: value.split('/')[1]!, apiKey: 'secret-key' })
const settle = async () => { for (let i = 0; i < 400; i++) await new Promise(r => setTimeout(r, 0)) }

/** A model that answers each scenario by its group with a recorded step, and counts the calls in flight. */
function recordedModel(opts: { failOn?: (r: LeadRequest) => boolean } = {}) {
  const byLast = new Map(ALL_SCENARIOS.map(s => [s.last, s.wanted]))
  let inFlight = 0
  const seen = { max: 0, calls: 0, requests: [] as LeadRequest[] }
  const model: ModelAdapter = {
    async *stream(r) {
      seen.calls++
      seen.requests.push(r)
      inFlight++
      seen.max = Math.max(seen.max, inFlight)
      try {
        await new Promise(res => setTimeout(res, 0))
        if (opts.failOn?.(r)) throw new Error('The provider refused the call.')
        // The longest last line the request holds: one scenario's words can begin another's.
        const asked = [...byLast.keys()].filter(last => JSON.stringify(r.messages).includes(JSON.stringify(last).slice(1, -1)))
          .sort((a, b) => b.length - a.length)[0]
        const wanted = asked ? byLast.get(asked) : undefined
        yield* (wanted === 'hold' ? STEPS.held : wanted === 'task' ? STEPS.startsWork : STEPS.answered)
      } finally { inFlight-- }
    },
    async complete() { throw new Error('not used') },
  }
  return { model, seen }
}

function runner(model: ModelAdapter, accessFor = async (_u: string, m: string) => access(m)) {
  const sent: { event: string; payload: unknown }[] = []
  let t = 0
  const r = new ScenarioRunner('u1', { out: (event, payload) => sent.push({ event, payload }), model, access: accessFor, cacheKey: 'k', now: () => (t += 10) })
  const results = () => sent.filter(s => s.event === P.scenarioResult).map(s => s.payload as ScenarioResult)
  const done = () => sent.filter(s => s.event === P.scenarioDone)
  return { r, results, done }
}

describe('the scenario runner', () => {
  it('runs every scenario once on each model, a few at a time, and scores each line', async () => {
    const { model, seen } = recordedModel()
    const { r, results, done } = runner(model)
    const ack = r.run({ models: ['p1/a', 'p1/b'], adaptiveVoice: true })
    expect(ack).toMatchObject({ ok: true, calls: 168 })
    await settle()
    expect(seen.calls).toBe(168)
    expect(seen.max).toBeLessThanOrEqual(SCENARIO_CONCURRENCY)
    expect(seen.max).toBeGreaterThan(1)
    expect(results()).toHaveLength(168)
    expect(results().every(x => x.pass)).toBe(true)
    expect(results().find(x => x.did === 'held')).toMatchObject({ reason: 'Ended on "um", mid-thought', text: '', inputTokens: 3_410, outputTokens: 22 })
    expect(done()).toEqual([{ event: P.scenarioDone, payload: { runId: (ack as { runId: string }).runId, cancelled: false } }])
  })

  it('sends what Live sends a spoken turn: the voice turn block, keep_listening and start_work, the first step reasoning least', async () => {
    const { model, seen } = recordedModel()
    const { r } = runner(model)
    r.run({ models: ['p1/a'], adaptiveVoice: false })
    await settle()
    const request = seen.requests[0]!
    expect(request.tools.map(t => t.name)).toEqual(['start_work', KEEP_LISTENING])
    expect(request).toMatchObject({ spoken: true, firstSpokenStep: true })
    expect(JSON.stringify(request.messages)).toMatch(/First judge whether they have finished their thought/)
    expect(JSON.stringify(request.messages)).not.toMatch(/begin it with one short sentence/)
  })

  it('a model failing mid-run shows an error on its lines and the run goes on', async () => {
    let calls = 0
    const { model } = recordedModel({ failOn: r => r.access.model === 'b' && ++calls > 10 })
    const { r, results, done } = runner(model)
    r.run({ models: ['p1/a', 'p1/b'], adaptiveVoice: true })
    await settle()
    const ofB = results().filter(x => x.model === 'p1/b')
    expect(results()).toHaveLength(168)
    expect(ofB.filter(x => x.error)).toHaveLength(74)
    expect(ofB.find(x => x.error)).toMatchObject({ pass: false, did: 'failed', error: 'The provider refused the call.' })
    expect(results().filter(x => x.model === 'p1/a').every(x => x.pass)).toBe(true)
    expect(done()).toHaveLength(1)
  })

  it('a model it cannot reach fails each of its lines, and the others still run', async () => {
    const { model } = recordedModel()
    const { r, results } = runner(model, async (_u, m) => { if (m === 'p1/b') throw new Error('Not offered to you.'); return access(m) })
    r.run({ models: ['p1/a', 'p1/b'], adaptiveVoice: true })
    await settle()
    expect(results().filter(x => x.model === 'p1/b').every(x => x.error === 'Not offered to you.')).toBe(true)
    expect(results().filter(x => x.model === 'p1/a').every(x => x.pass)).toBe(true)
  })

  it('keeps exactly what each call sent, without the key, until results are cleared', async () => {
    const { model, seen } = recordedModel()
    const { r, results } = runner(model)
    const ack = r.run({ models: ['p1/a'], adaptiveVoice: true }) as { runId: string }
    await settle()
    const line = results()[0]!
    const answer = r.sentRequest({ runId: ack.runId, scenarioId: line.scenarioId, model: 'p1/a' })
    expect(answer.ok).toBe(true)
    const sent = (answer as { sent: { instructions: string[]; messages: unknown[]; tools: { name: string }[]; settings: Record<string, unknown> } }).sent
    const request = seen.requests.find(q => JSON.stringify(q.messages) === JSON.stringify(sent.messages))!
    expect(sent.instructions).toEqual(request.system.map(p => p.text))
    expect(sent.tools.map(t => t.name)).toEqual(['start_work', KEEP_LISTENING])
    expect(sent.settings).toMatchObject({ model: 'a', spoken: true, firstSpokenStep: true })
    expect(JSON.stringify(sent)).not.toContain('secret-key')
    r.clear()
    expect(r.sentRequest({ runId: ack.runId, scenarioId: line.scenarioId, model: 'p1/a' }).ok).toBe(false)
  })

  it('refuses a run with no model, and estimates a run before it starts', () => {
    const { r } = runner(recordedModel().model)
    expect(r.run({ models: [], adaptiveVoice: true })).toEqual({ ok: false, error: 'Choose at least one model to compare.' })
    expect(r.library().inputTokensPerRun).toBeGreaterThan(84 * 500)
  })
})

describe('the scenario runner on the socket', () => {
  function socket(userId?: string) {
    const handlers = new Map<string, (...args: unknown[]) => void>()
    const emitted: { event: string; payload: unknown }[] = []
    const s: PlaygroundSocket = {
      id: 's1', ...(userId ? { data: { user: { id: userId } } } : {}),
      emit: (event, payload) => emitted.push({ event, payload }),
      on: (event, listener) => handlers.set(event, listener),
    }
    return { s, handlers, emitted }
  }
  const log = { info: () => undefined, error: () => undefined }
  const make = () => ({
    lead: () => fakeLead({ delayMs: 0 }, async () => undefined), speech: async () => ({ reason: 'none' }), log: () => undefined,
    scenarios: { model: recordedModel().model, access: async (_u: string, m: string) => access(m), cacheKey: 'k' },
  })

  it('is refused outside a development build and for nobody signed in', () => {
    for (const [userId, env] of [['u1', { NODE_ENV: 'production' }], [undefined, { NODE_ENV: 'development' }]] as const) {
      const { s, handlers } = socket(userId)
      registerVoicePlayground(s, log, make, env)
      const acks: unknown[] = []
      for (const event of [P.scenarios, P.scenarioRun, P.scenarioSent]) handlers.get(event)!({}, (a: unknown) => acks.push(a))
      expect(acks).toEqual([0, 1, 2].map(() => ({ ok: false, error: PLAYGROUND_REFUSED })))
    }
  })

  it('in development, gives the library and runs it, its results on this socket only', async () => {
    const { s, handlers, emitted } = socket('u1')
    registerVoicePlayground(s, log, make, { NODE_ENV: 'development' })
    const acks: { ok: boolean; library?: { groups: unknown[] }; calls?: number }[] = []
    handlers.get(P.scenarios)!({}, (a: never) => acks.push(a))
    handlers.get(P.scenarioRun)!({ models: ['p1/a'], adaptiveVoice: true }, (a: never) => acks.push(a))
    expect(acks[0]!.library!.groups).toHaveLength(4)
    expect(acks[1]).toMatchObject({ ok: true, calls: 84 })
    await settle()
    expect(emitted.filter(e => e.event === P.scenarioResult)).toHaveLength(84)
    expect(emitted.filter(e => e.event === P.scenarioDone)).toHaveLength(1)
  })
})
