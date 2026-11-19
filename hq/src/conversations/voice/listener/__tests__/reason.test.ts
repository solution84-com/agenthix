/**
 * The playground-only toggle `withReason`: the light model gives a short reason, written first, from the call that made
 * the choice. Off, the call is what hq has always sent.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { LISTENER_SETTINGS, buildListenerCall, listenerSettingsWith, parseListenerResponse, type ListenerInput } from '..'

const base: ListenerInput = {
  agent: 'Kernel', person: 'Sam', messageSoFar: "So what's the weather like in Melbourne this weekend?",
  moment: { kind: 'soundsFinished' }, recap: 'Sam is planning a weekend trip.',
  exchanges: [{ who: 'person', text: 'I might go away.' }], recentLines: ['Mm-hm.'], thisTurn: [],
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const on = listenerSettingsWith({ withReason: true })
const json = (o: unknown) => ({ text: JSON.stringify(o), calls: [] })

describe('withReason is off in hq and off by default', () => {
  it('is off in hq\'s own settings and when a change does not name it', () => {
    expect(LISTENER_SETTINGS.withReason).toBe(false)
    expect(listenerSettingsWith({ caps: { hold: 10 } }).withReason).toBe(false)
    expect(on.withReason).toBe(true)
  })
})

describe('the request with the reason off is what hq sent before it existed', () => {
  it('has the same instructions and user message byte for byte', () => {
    const noAnswer = listenerSettingsWith({ withAnswer: false })
    const plain = buildListenerCall(base, { settings: noAnswer })
    const off = buildListenerCall(base, { settings: listenerSettingsWith({ withAnswer: false, withReason: false }) })
    expect(off).toEqual(plain)
    // Pinned with the answer off: the answer's text moved when it was capped (version 12); next_check went and invite
    // moved in version 15; hum went in version 16; the listening style came in version 17 and went in 18 with the line's tone, re-pinned from that code. The user message of a first check is unchanged.
    expect(sha(plain.system)).toBe('26d0583c24dc5431ea9af8087285f0a5341c7e3420a018c248a6da5b3d1dff94')
    expect(sha(buildListenerCall(base, { mode: 'tools', settings: noAnswer }).system)).toBe('f81f412916a4f0da8516d357e2171dcc9b64dafe5f158921c3cc8b0ddf6c9030')
    expect(sha(plain.user)).toBe('c88b9f5fd15573ee5026350bfabdc59e2e04554613f852cf2eb157d7f2fc8f33')
    expect(plain.system).not.toContain('"why"')
  })

  it('asks for "why" first in the object when on, with a length cap, and changes nothing else in the user message', () => {
    const plain = buildListenerCall(base, {})
    const c = buildListenerCall(base, { settings: on })
    expect(c.user).toBe(plain.user)
    expect(c.system).toContain('"why"')
    expect(c.system).toMatch(/\{"why": "<[^"]*>", "action": "keep_listening"/)
    expect(c.system).toMatch(/\{"why": "<[^"]*>", "action": "hand_over"/)
    expect(c.system).toMatch(/at most \d+ words/)
    expect(c.system.indexOf('"why"')).toBeGreaterThan(plain.system.length - 600)
  })

  it('gives every tool a first optional why when on, in the tools variant', () => {
    const c = buildListenerCall(base, { mode: 'tools', settings: on })
    for (const t of c.tools) {
      const props = Object.keys((z.toJSONSchema(t.input) as { properties: object }).properties)
      expect(props[0]).toBe('why')
    }
    for (const t of buildListenerCall(base, { mode: 'tools' }).tools) {
      expect(Object.keys((z.toJSONSchema(t.input) as { properties: object }).properties)).not.toContain('why')
    }
  })
})

describe('the parser reads the reason only when on', () => {
  const raw = { why: 'They asked a question and stopped.', action: 'hand_over', asked: 'weather', answer: 'Sunny.', hold: 'Let me check the weather.', next_check: 2 }
  const ctx = { mode: 'json' as const, soundsFinished: true }

  it('keeps it on the decision when on, for any choice', () => {
    expect(parseListenerResponse(json(raw), { ...ctx, settings: on })).toMatchObject({ tool: 'hand_over', why: 'They asked a question and stopped.' })
    expect(parseListenerResponse(json({ why: 'Still talking.', action: 'keep_listening', next_check: 2 }), { ...ctx, settings: on }))
      .toMatchObject({ tool: 'keep_listening', why: 'Still talking.' })
  })

  it('ignores it when off: the decision is what it was', () => {
    const d = parseListenerResponse(json(raw), ctx)
    expect(d).not.toHaveProperty('why')
    expect(d).toEqual({ tool: 'hand_over', asked: 'weather', answer: 'Sunny.', hold: 'Let me check the weather.' })
  })

  it('cuts a reason that runs on, and reads a tool call\'s too', () => {
    const long = parseListenerResponse(json({ ...raw, why: 'word '.repeat(200) }), { ...ctx, settings: on })
    expect((long as { why: string }).why.length).toBeLessThanOrEqual(240)
    expect(parseListenerResponse({ text: '', calls: [{ name: 'acknowledge', input: { why: 'A pause.', say: 'Right.', next_check: 2 } }] },
      { mode: 'tools', soundsFinished: false, settings: on })).toMatchObject({ tool: 'acknowledge', why: 'A pause.' })
  })

  it('has no reason when the object gave none, and a dropped answer keeps its reason', () => {
    expect(parseListenerResponse(json({ action: 'keep_listening' }), { ...ctx, settings: on })).not.toHaveProperty('why')
    expect(parseListenerResponse(json({ why: 'Done.', action: 'hand_over', hold: '' }), { ...ctx, settings: on }))
      .toMatchObject({ tool: 'keep_listening', why: 'Done.' })
  })
})
