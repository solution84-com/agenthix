/**
 * One call to the light model, built from what it reads (spec §What it reads, each call), and the six tools as offered.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { LISTENER_SETTINGS, LISTENER_TOOLS, buildListenerCall, isSoundsFinishedCall, type ListenerInput } from '..'

const base: ListenerInput = {
  agent: 'Kernel', person: 'Sam', messageSoFar: "So what's the weather like in Melbourne this weekend, because",
  moment: { kind: 'quietAfterWords', quietMs: 300 }, recap: 'Sam is planning a weekend trip to Melbourne.',
  exchanges: [{ who: 'person', text: 'I might go away.' }, { who: 'agent', text: 'Somewhere nice?' }],
  recentLines: ['Mm-hm.', 'Right, I see.'], thisTurn: [],
}

describe('buildListenerCall @SC-2202', () => {
  it('puts everything it reads in the user message, and nothing of the agent beyond its name', () => {
    const c = buildListenerCall(base, { mode: 'tools' })
    expect(c.user).toContain("So what's the weather like in Melbourne this weekend, because")
    expect(c.user).toContain('Sam is planning a weekend trip to Melbourne.')
    expect(c.user).toContain('Kernel: "Somewhere nice?"')
    expect(c.user).toContain('- "Right, I see."')
    expect(c.user).toContain('Nothing yet.')
    expect(c.user).toContain('paused for 0.3 s after their last words')
    expect(c.system).toContain('listening ear of Kernel')
  })

  it('keeps the instructions the same from call to call, so a provider can cache them', () => {
    const a = buildListenerCall(base, { mode: 'tools' })
    const b = buildListenerCall({ ...base, messageSoFar: 'Other words.', moment: { kind: 'soundsFinished' } }, { mode: 'tools' })
    expect(a.system).toBe(b.system)
  })

  it('offers the six tools, none with next_check, in the tools variant only', () => {
    const c = buildListenerCall(base, { mode: 'tools' })
    expect(c.tools.map(t => t.name)).toEqual([...LISTENER_TOOLS])
    for (const t of c.tools) expect(Object.keys((z.toJSONSchema(t.input) as { properties?: object }).properties ?? {})).not.toContain('next_check')
    const handOver = c.tools.find(t => t.name === 'hand_over')!
    expect(Object.keys((z.toJSONSchema(handOver.input) as { properties: object }).properties)).toEqual(['asked', 'answer', 'hold', 'tone'])
    expect(buildListenerCall(base, { mode: 'json' }).tools).toEqual([])
  })

  it('leaves answer out of hand_over and the instructions when asked to', () => {
    const c = buildListenerCall(base, { mode: 'tools', withAnswer: false })
    const handOver = c.tools.find(t => t.name === 'hand_over')!
    expect(Object.keys((z.toJSONSchema(handOver.input) as { properties: object }).properties)).toEqual(['asked', 'hold', 'tone'])
    expect(c.system).not.toMatch(/- answer:/)
    expect(buildListenerCall(base, { mode: 'json', withAnswer: false }).system).not.toContain('"answer"')
    expect(buildListenerCall(base, { mode: 'json' }).system).toContain('"answer"')
  })

  it('answers as one JSON object unless told otherwise, the safe default the measurements took', () => {
    expect(LISTENER_SETTINGS.format).toBe('json')
    const c = buildListenerCall(base, {})
    expect(c.mode).toBe('json')
    expect(c.tools).toEqual([])
    expect(c.system).toContain('Answer with one JSON object')
    expect(buildListenerCall(base, { mode: 'tools' }).mode).toBe('tools')
  })

  it('says whether the call may end the turn', () => {
    expect(buildListenerCall(base, { mode: 'tools' }).soundsFinished).toBe(false)
    expect(buildListenerCall({ ...base, moment: { kind: 'soundsFinished', quietMs: 700 } }, { mode: 'tools' }).soundsFinished).toBe(true)
    expect(isSoundsFinishedCall({ kind: 'quiet', quietMs: 4000, soundsFinished: true })).toBe(true)
    expect(isSoundsFinishedCall({ kind: 'quiet', quietMs: 4000 })).toBe(false)
    expect(isSoundsFinishedCall({ kind: 'working', workingMs: 4000 })).toBe(false)
    expect(buildListenerCall(base, { mode: 'tools' }).user).toContain('close_turn and hand_over are not allowed now')
  })

  it('reads only the last few exchanges and lines, as the settings say', () => {
    const exchanges = Array.from({ length: 10 }, (_, i) => ({ who: 'person' as const, text: `message ${i}` }))
    const recentLines = Array.from({ length: 8 }, (_, i) => `line ${i}`)
    const c = buildListenerCall({ ...base, exchanges, recentLines }, { mode: 'tools' })
    expect(c.user).not.toContain('message 3')
    expect(c.user).toContain('message 4')
    expect(c.user).not.toContain('line 2')
    expect(c.user).toContain('line 3')
    expect(LISTENER_SETTINGS.recentExchanges).toBe(6)
  })

  it('reads no exchanges and no lines when the settings say none', () => {
    const settings = { ...LISTENER_SETTINGS, recentExchanges: 0, recentLines: 0 }
    const c = buildListenerCall(base, { mode: 'json', settings })
    expect(c.user).not.toContain('I might go away.')
    expect(c.user).not.toContain('Right, I see.')
  })

  it('caps the message so far at its end, cut at a word', () => {
    const long = `${'word '.repeat(1000)}the newest words`
    const c = buildListenerCall({ ...base, messageSoFar: long }, { mode: 'tools' })
    expect(c.user).toContain('the newest words')
    expect(c.user).toMatch(/<message>\n…word /)
    expect(c.user.length).toBeLessThan(long.length)
  })

  it('still reads an older page\'s pause after words, leaving whether they are mid-sentence to the words', () => {
    const c = buildListenerCall(base, { mode: 'tools' })
    expect(c.user).toMatch(/punctuation .* only a hint/)
    expect(c.soundsFinished).toBe(false)
    expect(LISTENER_SETTINGS).not.toHaveProperty('quietAfterWordsMs')
  })

  it('tells it what it did this turn, and how long the wait has lasted', () => {
    const c = buildListenerCall({
      ...base, moment: { kind: 'working', workingMs: 6200 },
      thisTurn: [{ tool: 'acknowledge', words: 'Right.' }, { tool: 'hand_over', words: 'Let me check the weather.', atMs: 6200 }],
    }, { mode: 'tools' })
    expect(c.user).toContain('- acknowledge: "Right."')
    expect(c.user).toContain('- hand_over, hold: "Let me check the weather." (6.2 s ago)')
    expect(c.user).toContain('worked out for 6.2 s so far. They are waiting for you, so this is no time for an invitation.')
  })
})
