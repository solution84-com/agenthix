/**
 * Live with the light model (plan task 5.1): the playground's conversation answers `listen` with hq's own listening
 * call — a hand over admitted as its spoken message and answered by the lead, the hold heard first in the agent
 * message, the recap written in memory after the reply; a turn closed alone recorded as a completed turn; off when
 * the page's switch is off. Fakes only for the models and the speech service.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../../../shared/conversations/voice'
import { PLAYGROUND_CONVERSATION_ID as ID, VOICE_PLAYGROUND_SOCKET as P, playgroundEvent as pe, type PlaygroundEntry } from '../../../../../shared/voicePlayground'
import { LIGHT_SOCKET as L, type LightCallRow, type LightRecapRow, type LightTurnRow } from '../../../../../shared/voicePlaygroundLight'
import type { LeadRequest, LeadStreamEvent, ModelAdapter } from '../../../../contract'
import { PlaygroundConversation } from '../../conversation'
import { leadFor } from '../../leads'
import { ACCESS, USAGE, json, scriptedModel, userText } from './fakes'

const finish: LeadStreamEvent = { type: 'finish', reason: 'stop', usage: USAGE }

/** `ms` of 24 kHz PCM16 with a voice in it. */
const voiced = (ms: number) => {
  const b = Buffer.alloc(Math.round(ms * 24) * 2)
  for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(i % 2 ? 8000 : -8000, i * 2)
  return b
}

function heavy(replies: string[]): ModelAdapter & { requests: LeadRequest[] } {
  const requests: LeadRequest[] = []
  return {
    requests,
    async *stream(request) {
      requests.push(request)
      yield { type: 'text', text: replies.shift() ?? 'Done.' }
      yield finish
    },
    async complete() { throw new Error('not used') },
  }
}

const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0)) }

function playground({ leadModel = undefined as (ModelAdapter & { requests: LeadRequest[] }) | undefined, replies = ['It will be sunny and 24 degrees.'], recapMs = 0, handOver = { action: 'hand_over', asked: 'the weather', answer: 'Rain, surely.', hold: 'Let me check the forecast.', next_check: 3 } as Record<string, unknown>, holds = [] as string[] } = {}) {
  const sent: { event: string; payload: unknown }[] = []
  const lead = leadModel ?? heavy(replies)
  const lineCalls: { text: string; direction: string }[] = []
  const recaps = ['Sam asked about the Melbourne weather; Kernel said sunny.', 'Sam asked again; Kernel said rain.']
  const light = scriptedModel([
    [/Write the new recap/, { delayMs: recapMs, get text() { return recaps.shift() ?? 'Later.' } }],
    [/Melbourne/, json(handOver)],
    [/thanks/, json({ action: 'close_turn', say: 'Any time.', next_check: 2 })],
    [/repeat/, { delayMs: 0, get text() { return json({ action: 'hand_over', asked: 'a repeat', hold: holds.shift() ?? 'Once more.', next_check: 2 }) } }],
  ])
  let n = 0
  const c = new PlaygroundConversation({
    out: (event, payload) => sent.push({ event, payload }),
    lead: args => leadFor(args.lead, 'u1', { model: lead, access: async () => ACCESS, cacheKey: 'k', wait: async () => undefined }),
    speech: async () => ({
      async *synthesize() { yield { audio: Buffer.alloc(480) } },
      async *line(text: string, direction: string) {
        lineCalls.push({ text, direction })
        // As the speech service streams it: the voice in pieces, then the quiet it leaves after a line.
        for (const piece of [voiced(120), voiced(150), voiced(100), Buffer.alloc(24_000)]) { await Promise.resolve(); yield piece }
      },
      stored: async () => ({ text: 'Okay, bear with me.', audio: Buffer.alloc(960) }),
    }),
    log: () => undefined,
    newId: () => `id-${n++}`,
    wait: async () => undefined,
    every: () => () => undefined,
    light: { model: light, access: async () => ACCESS, heavyAccess: async () => ACCESS },
  })
  const of = <T>(event: string) => sent.filter(s => s.event === event).map(s => s.payload as T)
  const entries = () => {
    const byId = new Map<string, PlaygroundEntry>()
    for (const e of of<PlaygroundEntry>(P.entry)) byId.set(e.id, e)
    return [...byId.values()]
  }
  const listen = (seq: number, moment: string, text: string) => c.voiceEvent(V.listen, { conversationId: ID, seq, moment, text, quietMs: 600 })
  return { c, sent, of, entries, listen, lead, light, lineCalls }
}

const ON = { on: true, model: 'p1/flash', settings: {}, lead: { kind: 'model', model: 'p1/big' }, adaptiveVoice: true }
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** A lead whose first step only calls set_listening_style, and whose second says so. */
function styleLead(): ModelAdapter & { requests: LeadRequest[] } {
  const requests: LeadRequest[] = []
  return {
    requests,
    async *stream(request) {
      requests.push(request)
      if (requests.length === 1) yield { type: 'tool-call', call: { id: 'call-1', name: 'set_listening_style', input: { style: 'hums_off' } } }
      else yield { type: 'text', text: 'Sure, no more hums from me.' }
      yield finish
    },
    async complete() { throw new Error('not used') },
  }
}

describe('the playground with the light model @SC-1840 @SC-2224', () => {
  it('a reply that only set the listening style takes a second step, with the call\'s answer, and says so @SC-2232', async () => {
    const p = playground({ leadModel: styleLead() })
    p.c.light.configure(ON)
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.listen(1, 'soundsFinished', 'Melbourne aside, could you stop humming?')
    await settle(); await settle()
    expect(p.lead.requests).toHaveLength(2)
    expect(p.lead.requests[1]!.messages.slice(-2)).toMatchObject([
      { role: 'assistant', toolCalls: [{ name: 'set_listening_style' }] },
      { role: 'tool', toolName: 'set_listening_style', result: { style: 'hums_off', set: true } },
    ])
    expect(p.of<{ style?: string }>(pe(V.listened)).some(e => e.style === 'hums_off')).toBe(true)
    expect(p.entries().find(e => e.role === 'agent')).toMatchObject({ state: 'COMPLETED', text: expect.stringContaining('Sure, no more hums from me.') })
  })

  it('hands a finished question over: the hold plays, the lead answers, the hold is first in the agent message, the recap follows', async () => {
    const p = playground()
    p.c.light.configure(ON)
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.listen(1, 'soundsFinished', "What's the weather in Melbourne?")
    await settle()
    expect(p.of(pe(V.listened))).toEqual([expect.objectContaining({ seq: 1, action: 'hand_over', say: 'Let me check the forecast.', turn: 'handedOver' })])
    expect(new Set(p.of<{ text: string }>(pe(V.line)).map(l => l.text))).toEqual(new Set(['Let me check the forecast.']))
    const agent = p.entries().find(e => e.role === 'agent')!
    expect(agent).toMatchObject({ state: 'COMPLETED', text: 'Let me check the forecast.\n\nIt will be sunny and 24 degrees.' })
    expect(p.entries().find(e => e.role === 'person')).toMatchObject({ text: "What's the weather in Melbourne?", spoken: true })
    // The heavy model is told how to speak, and is offered no keep_listening; it may set the listening style.
    expect(p.lead.requests[0]!.tools.map(t => t.name)).toEqual(['start_work', 'set_listening_style'])
    expect(p.of<LightCallRow>(L.call)[0]).toMatchObject({ choice: 'hand_over', answer: 'Rain, surely.', asked: 'the weather' })
    expect(p.of<LightRecapRow>(L.recap)).toEqual([expect.objectContaining({ text: 'Sam asked about the Melbourne weather; Kernel said sunny.' })])
    expect(p.c.light.recap).toBe('Sam asked about the Melbourne weather; Kernel said sunny.')
    // `answer` reached the playground's own rows, not hq's voice events to the browser.
    expect(JSON.stringify(p.sent.filter(s => s.event !== L.call))).not.toMatch(/Rain, surely/)
  })

  it('a line the page dropped is not recorded as played; one played to its end is @SC-2229', async () => {
    const p = playground()
    p.c.light.configure(ON)
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.listen(1, 'soundsFinished', "What's the weather in Melbourne?")
    await settle()
    const lineId = p.of<{ lineId: string }>(pe(V.line))[0]!.lineId
    p.c.voiceEvent(V.linePlayed, { conversationId: ID, lineId, skipped: true })
    await settle()
    expect(p.of(L.line)).toEqual([])
    p.c.voiceEvent(V.linePlayed, { conversationId: ID, lineId })
    await settle()
    expect(p.of(L.line)).toHaveLength(1)
  })

  it('cuts an answer over its cap and marks the row, the hand over and its hold standing', async () => {
    const answer = Array.from({ length: 30 }, (_, i) => `w${i + 1}`).join(' ')
    const p = playground({ handOver: { action: 'hand_over', asked: 'the weather', answer, hold: 'Let me check the forecast.', next_check: 3 } })
    p.c.light.configure(ON)
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.listen(1, 'soundsFinished', "What's the weather in Melbourne?")
    await settle()
    const row = p.of<LightCallRow>(L.call)[0]!
    expect(row).toMatchObject({ choice: 'hand_over', words: 'Let me check the forecast.', answerCut: true, dropped: null })
    expect(row.answer!.split(' ')).toHaveLength(15)
  })

  it('with the reason on, the reason reaches the Log row only; off, the row has none @SC-1840', async () => {
    for (const withReason of [true, false]) {
      const p = playground({ handOver: { why: 'A finished question about forecasts.', action: 'hand_over', asked: 'the weather', hold: 'Let me check the forecast.', next_check: 3 } })
      p.c.light.configure({ ...ON, settings: { withReason } })
      p.c.voiceEvent(V.start, { conversationId: ID })
      await settle()
      p.listen(1, 'soundsFinished', "What's the weather in Melbourne?")
      await settle()
      const row = p.of<LightCallRow>(L.call)[0]!
      expect(row).toMatchObject({ choice: 'hand_over', withReason })
      expect(row.why).toBe(withReason ? 'A finished question about forecasts.' : null)
      expect(JSON.stringify(p.sent.filter(s => s.event !== L.call))).not.toMatch(/finished question about forecasts/)
      const system = p.light.requests[0]!.system.map(b => b.text).join('')
      expect(system.includes('"why"')).toBe(withReason)
    }
  })

  it('closes "thanks" alone, as a completed turn the lead never answers, and the next call reads it', async () => {
    const p = playground()
    p.c.light.configure(ON)
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.listen(1, 'soundsFinished', 'Great, thanks.')
    await settle()
    expect(p.of(pe(V.listened))).toEqual([expect.objectContaining({ action: 'close_turn', turn: 'closed', say: 'Any time.' })])
    expect(p.entries().map(e => [e.role, e.text, e.state])).toEqual([['person', 'Great, thanks.', undefined], ['agent', 'Any time.', 'COMPLETED']])
    expect(p.lead.requests).toHaveLength(0)
    expect(p.of<LightTurnRow>(L.turn).map(t => t.outcome)).toEqual(['closed'])
    p.listen(2, 'quietAfterWords', 'And one more')
    await settle()
    expect(userText(p.light.requests.at(-1)!)).toMatch(/the person: "Great, thanks\."\n.*Any time\./)
  })

  it('answers off with the switch off, and the next settings apply from the next call', async () => {
    const p = playground()
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.listen(1, 'quietAfterWords', 'So')
    await settle()
    expect(p.of(pe(V.listened))).toEqual([expect.objectContaining({ seq: 1, off: true })])
    p.c.light.configure({ ...ON, settings: { caps: { hold: 2 } } })
    p.listen(2, 'soundsFinished', "What's the weather in Melbourne?")
    await settle()
    // A hold over its new cap of two words is dropped: keep_listening, the turn kept open.
    expect(p.of<LightCallRow>(L.call)[0]).toMatchObject({ choice: 'keep_listening', dropped: 'over the word cap', droppedWords: 'Let me check the forecast.' })
    expect(p.of<LightTurnRow>(L.turn).map(t => t.outcome)).toEqual(['notYet'])
  })

  it('sends a line in parts as its speech streams in, as hq does, spoken plainly unless the page asks for the stored direction', async () => {
    const p = playground()
    p.c.light.configure(ON)
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.listen(1, 'soundsFinished', "What's the weather in Melbourne?")
    await settle()
    const parts = p.of<{ lineId: string; text: string; audio: Buffer; index?: number; end?: true }>(pe(V.line))
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.map(l => l.index)).toEqual(parts.map((_, i) => i))
    expect(parts.map(l => l.end)).toEqual([...parts.slice(1).map(() => undefined), true])
    expect(new Set(parts.map(l => l.lineId)).size).toBe(1)
    // The quiet the speech service leaves after the line is not sent: 370 ms of voice, and 80 ms after it, to within
    // the 20 ms the voice is read in.
    expect(parts.reduce((ms, l) => ms + l.audio.byteLength / 48, 0)).toBeLessThanOrEqual(370 + 80 + 20)
    expect(p.lineCalls).toEqual([{ text: 'Let me check the forecast.', direction: 'plain' }])

    p.c.light.configure({ ...ON, lineDirection: 'stored' })
    p.listen(2, 'soundsFinished', 'Great, thanks.')
    await settle()
    expect(p.lineCalls.map(l => l.direction)).toEqual(['plain', 'stored'])
  })

  it('a finished reply withdrawn by a continue: the hold goes back to start the reply that answers again, and its recap is not written', async () => {
    const p = playground({ replies: ['It will be sunny.', 'Rain is likely on Thursday.'], recapMs: 40 })
    p.c.light.configure(ON)
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.listen(1, 'soundsFinished', "What's the weather in Melbourne?")
    await settle()
    const first = p.entries().find(e => e.role === 'agent')!
    expect(first).toMatchObject({ state: 'COMPLETED', text: 'Let me check the forecast.\n\nIt will be sunny.' })
    p.c.voiceEvent(V.continue, { conversationId: ID, turnId: first.turnId, text: 'on Thursday?' })
    await settle()
    await wait(80)
    const agents = p.entries().filter(e => e.role === 'agent')
    expect(agents[0]).toMatchObject({ withdrawn: true, text: '' })
    expect(agents[1]).toMatchObject({ state: 'COMPLETED', text: 'Let me check the forecast.\n\nRain is likely on Thursday.' })
    const rows = p.of<LightRecapRow>(L.recap)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ text: null, error: expect.stringMatching(/not heard/) })
    expect(rows[1]).toMatchObject({ text: 'Sam asked again; Kernel said rain.' })
    expect(p.c.light.recap).toBe('Sam asked again; Kernel said rain.')
  })

  it('a finished reply cut by the person speaking over it: the hold stays, only the reply is cut, and the last recap is put back', async () => {
    const p = playground({ replies: ['It will be sunny. Bring a hat though, it gets hot by noon.'] })
    p.c.light.configure(ON)
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.listen(1, 'soundsFinished', "What's the weather in Melbourne?")
    await settle()
    expect(p.c.light.recap).toBe('Sam asked about the Melbourne weather; Kernel said sunny.')
    const agent = p.entries().find(e => e.role === 'agent')!
    p.c.voiceEvent(V.interrupt, { conversationId: ID, turnId: agent.turnId, heardThrough: 0 })
    await settle()
    expect(p.entries().find(e => e.role === 'agent')).toMatchObject({ interrupted: true, text: 'Let me check the forecast.\n\nIt will be sunny.' })
    expect(p.c.light.recap).toBeNull()
  })

  it('four hand-overs, each reply cut while it plays: each message starts with its own hold only, never an earlier one', async () => {
    const holds = ['Of course, let me go over it once more.', 'Right, one more time through it for you.', 'Sure, one more time through it.', 'Okay, running through it once more for you.']
    const p = playground({ holds: [...holds], replies: holds.map((_, i) => `Here it is again, take ${i + 1}. Tell them early and say why.`) })
    p.c.light.configure(ON)
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    for (let i = 0; i < holds.length; i++) {
      p.listen(i + 1, 'soundsFinished', 'Can you repeat that?')
      await settle()
      const agent = p.entries().filter(e => e.role === 'agent').at(-1)!
      expect(agent).toMatchObject({ state: 'COMPLETED' })
      p.c.voiceEvent(V.interrupt, { conversationId: ID, turnId: agent.turnId, heardThrough: 0 })
      await settle()
    }
    const agents = p.entries().filter(e => e.role === 'agent')
    expect(agents.map(a => a.text)).toEqual(holds.map((hold, i) => `${hold}\n\nHere it is again, take ${i + 1}.`))
    expect(agents.every(a => a.interrupted)).toBe(true)
  })
})
