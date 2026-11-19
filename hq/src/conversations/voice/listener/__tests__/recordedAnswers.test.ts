/**
 * The parser and its rules against real answers (plan task 2.4): 37 answers DeepSeek Flash gave in phase 1's
 * measurement runs, in both formats, every choice and the over-cap drops, each with the decision it must read to.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseListenerResponse, spokenWords, type ListenerDecision, type ListenerResponse } from '..'

type Recorded = { from: string; mode: 'json' | 'tools'; soundsFinished: boolean; raw: ListenerResponse; decision: ListenerDecision }
const answers = (JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'recordedAnswers.json'), 'utf8')) as { answers: Recorded[] }).answers

describe('recorded answers', () => {
  it('cover both formats, every choice, and a drop over the cap', () => {
    const kinds = new Set(answers.map(a => `${a.mode}:${a.decision.tool}`))
    for (const mode of ['json', 'tools']) {
      for (const tool of ['keep_listening', 'acknowledge', 'invite', 'close_turn', 'hand_over']) expect(kinds).toContain(`${mode}:${tool}`)
    }
    // Recorded before the light model lost its hum: each now reads as keep_listening.
    expect(answers.some(a => a.decision.tool === 'keep_listening' && a.decision.dropped?.tool === 'hum')).toBe(true)
    expect(answers.some(a => a.decision.tool === 'keep_listening' && a.decision.dropped?.reason === 'over the word cap')).toBe(true)
  })

  it.each(answers.map(a => [a.from, a] as const))('%s reads to the same decision', (_, a) => {
    expect(parseListenerResponse(a.raw, { mode: a.mode, soundsFinished: a.soundsFinished })).toEqual(a.decision)
  })

  it('a hand_over read from them never speaks its answer @SC-2201', () => {
    for (const a of answers) {
      const d = parseListenerResponse(a.raw, { mode: a.mode, soundsFinished: a.soundsFinished })
      if (d.tool === 'hand_over' && d.answer) expect(spokenWords(d)).not.toContain(d.answer)
    }
  })

  it('the same answer outside a sounds finished call is kept listening, when it would end the turn @SC-2200', () => {
    for (const a of answers.filter(x => x.decision.tool === 'close_turn' || x.decision.tool === 'hand_over')) {
      expect(parseListenerResponse(a.raw, { mode: a.mode, soundsFinished: false }))
        .toMatchObject({ tool: 'keep_listening', dropped: { reason: 'ends the turn outside a sounds finished call' } })
    }
  })
})
