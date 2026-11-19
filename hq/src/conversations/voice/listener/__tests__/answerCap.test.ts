/** `caps.answer`: the light model's never-heard answer is one short sentence, cut to the cap if it runs over. */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { LISTENER_INSTRUCTIONS_VERSION, LISTENER_SETTINGS, LISTENER_SETTING_LIMITS, buildListenerCall, countWords, listenerSettingsWith, parseListenerResponse, type ListenerInput } from '..'

const base: ListenerInput = {
  agent: 'Kernel', person: 'Sam', messageSoFar: "So what's the weather like in Melbourne this weekend?",
  moment: { kind: 'soundsFinished' }, recap: 'Sam is planning a weekend trip.',
  exchanges: [{ who: 'person', text: 'I might go away.' }], recentLines: ['Mm-hm.'], thisTurn: [],
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const handOver = (answer: string, extra: object = {}) => ({
  text: JSON.stringify({ action: 'hand_over', asked: 'compound interest', answer, hold: 'One moment on that.', next_check: 2, ...extra }), calls: [],
})
const ctx = { mode: 'json' as const, soundsFinished: true }
const long = Array.from({ length: 40 }, (_, i) => `w${i + 1}`).join(' ')

describe('the cap @SC-2204', () => {
  it('starts at 15 words, within 5 to 60, and a change is held to the limits', () => {
    expect(LISTENER_SETTINGS.caps.answer).toBe(15)
    expect(LISTENER_SETTING_LIMITS['caps.answer']).toEqual({ min: 5, max: 60, whole: true })
    expect(listenerSettingsWith({ caps: { answer: 2 } }).caps.answer).toBe(5)
    expect(listenerSettingsWith({ caps: { answer: 500 } }).caps.answer).toBe(60)
    expect(listenerSettingsWith({ caps: { answer: 20 } }).caps.answer).toBe(20)
  })
})

describe('the instructions @SC-2204', () => {
  it('ask for one short sentence of at most the cap, the gist and never the working-out, with an example', () => {
    expect(LISTENER_INSTRUCTIONS_VERSION).toBe(18)
    const s = buildListenerCall(base, { settings: listenerSettingsWith({ caps: { answer: 20 } }) }).system
    expect(s).toMatch(/answer: .*in one short sentence of at most 20 words: the gist, never the working-out/)
    expect(s).toContain('Interest also earns interest')
    expect(countWords('Interest also earns interest; $1,000 at 5% is $1,050, then $1,102.50.')).toBeLessThanOrEqual(15)
    expect(buildListenerCall(base, {}).system).toContain('at most 15 words: the gist')
  })

  it('carry the cap in the tools variant\'s answer too', () => {
    const t = buildListenerCall(base, { mode: 'tools' }).tools.find(x => x.name === 'hand_over')!
    const prop = (z.toJSONSchema(t.input) as unknown as { properties: { answer: { description: string } } }).properties.answer
    expect(prop.description).toContain('at most 15 words')
  })

  // Re-pinned at version 18 (the line's tone, the listening style gone); the tools' names and descriptions did not move.
  it('are unchanged with the answer off, byte for byte', () => {
    const off = listenerSettingsWith({ withAnswer: false })
    expect(sha(buildListenerCall(base, { settings: off }).system)).toBe('26d0583c24dc5431ea9af8087285f0a5341c7e3420a018c248a6da5b3d1dff94')
    expect(sha(buildListenerCall(base, { mode: 'tools', settings: off }).system)).toBe('f81f412916a4f0da8516d357e2171dcc9b64dafe5f158921c3cc8b0ddf6c9030')
    const tools = buildListenerCall(base, { mode: 'tools', settings: off }).tools
    expect(sha(JSON.stringify(tools.map(x => [x.name, x.description])))).toBe('9b0ecb37086a3b8c32214ede1a2b59c24a3523c4b8f2b3002d8e5394a393eef5')
    expect(buildListenerCall(base, { settings: off }).system).not.toContain('working-out')
  })
})

describe('the parser @SC-2204', () => {
  it('keeps an answer within the cap whole', () => {
    expect(parseListenerResponse(handOver('Interest also earns interest.'), ctx))
      .toMatchObject({ tool: 'hand_over', answer: 'Interest also earns interest.' })
    expect(parseListenerResponse(handOver('Interest also earns interest.'), ctx)).not.toHaveProperty('answerCut')
  })

  it('cuts an answer over the cap to the cap, keeps the call and the hold, and marks it', () => {
    const d = parseListenerResponse(handOver(long), ctx)
    expect(d).toMatchObject({ tool: 'hand_over', hold: 'One moment on that.', answerCut: true })
    if (d.tool !== 'hand_over') throw new Error('not a hand over')
    expect(d.answer).toBe(Array.from({ length: 15 }, (_, i) => `w${i + 1}`).join(' '))
    expect(d).not.toHaveProperty('dropped')
  })

  it('cuts to the changed cap, and cuts a tool call\'s answer too', () => {
    const d = parseListenerResponse(handOver(long), { ...ctx, settings: listenerSettingsWith({ caps: { answer: 5 } }) })
    expect(d.tool === 'hand_over' && countWords(d.answer ?? '')).toBe(5)
    const t = parseListenerResponse({ text: '', calls: [{ name: 'hand_over', input: { asked: 'x', answer: long, hold: 'One moment.', next_check: 2 } }] }, { mode: 'tools', soundsFinished: true })
    expect(t).toMatchObject({ tool: 'hand_over', answerCut: true })
  })
})
