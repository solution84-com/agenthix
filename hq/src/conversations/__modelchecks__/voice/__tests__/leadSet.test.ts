/**
 * The lead's scenario library as a model check (plan tasks 4c.3, 4c.4, 4c.6): the fixed library's shape; the scoring
 * of model steps as a model streams them; and a run through the same lead path as Live, with a model replaced only
 * where the call would leave hq.
 */
import { describe, expect, it } from 'vitest'
import type { LeadRequest, LeadStreamEvent, ModelAdapter } from '../../../contract'
import { KEEP_LISTENING } from '../../../lead/voiceLogic'
import { ALL_SCENARIOS, SCENARIO_GROUPS } from '../leadSet'
import { scoreStep } from '../leadSet/score'
import { runLeadScenario, scenarioTurn } from '../leadSet/run'
import type { ScenarioResult } from '../types'
import { playgroundContext } from '../../../voice/playground/context'

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

const access = { providerId: 'p1', providerName: 'Test', provider: 'openrouter' as const, model: 'a', apiKey: 'secret-key' }

/** A model that answers each scenario by its group with a recorded step. */
function recordedModel(opts: { fail?: boolean } = {}) {
  const byLast = new Map(ALL_SCENARIOS.map(s => [s.last, s.wanted]))
  const requests: LeadRequest[] = []
  const model: ModelAdapter = {
    async *stream(r) {
      requests.push(r)
      if (opts.fail) throw new Error('The provider refused the call.')
      // The longest last line the request holds: one scenario's words can begin another's.
      const asked = [...byLast.keys()].filter(last => JSON.stringify(r.messages).includes(JSON.stringify(last).slice(1, -1)))
        .sort((a, b) => b.length - a.length)[0]
      const wanted = asked ? byLast.get(asked) : undefined
      yield* (wanted === 'hold' ? STEPS.held : wanted === 'task' ? STEPS.startsWork : STEPS.answered)
    },
    async complete() { throw new Error('not used') },
  }
  return { model, requests }
}

describe('running the library', () => {
  it('scores every scenario of a recorded model against what its group wants', async () => {
    const { model } = recordedModel()
    const results: ScenarioResult[] = []
    for (const s of ALL_SCENARIOS) results.push(await runLeadScenario(s, model, access))
    expect(results.filter(r => !r.pass).map(r => [r.scenarioId, r.did])).toEqual([])
    expect(results).toHaveLength(84)
  })

  it('sends what Live sends a spoken turn: the voice turn block, keep_listening and start_work, the first step reasoning least', async () => {
    const { model, requests } = recordedModel()
    await runLeadScenario(ALL_SCENARIOS[0]!, model, access)
    const r = requests[0]!
    expect(r.tools.map(t => t.name)).toEqual(expect.arrayContaining(['start_work', KEEP_LISTENING]))
    expect(r.spoken).toBe(true)
    expect(r.firstSpokenStep).toBe(true)
    expect(JSON.stringify(r.messages)).toMatch(/First judge whether they have finished their thought/)
  })

  it('a model failing a call fails that scenario with the reason, and says nothing of the key', async () => {
    const { model } = recordedModel({ fail: true })
    const result = await runLeadScenario(ALL_SCENARIOS[0]!, model, access)
    expect(result).toMatchObject({ pass: false, did: 'failed', error: 'The provider refused the call.' })
    expect(JSON.stringify(result)).not.toContain('secret-key')
  })
})
