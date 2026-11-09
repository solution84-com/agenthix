/**
 * The voice playground's server side (plan task 4b.2), with its real parts: hq's VoiceSession, the lead's voice logic,
 * the lead's context; fakes only for what leaves hq, a model (recorded steps) and the speech service.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_SOCKET } from '../../../../shared/conversations/protocol'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../../shared/conversations/voice'
import {
  PLAYGROUND_CONVERSATION_ID as ID, PLAYGROUND_REFUSED, VOICE_PLAYGROUND_SOCKET as P, playgroundEvent as pe,
  type PlaygroundDecision, type PlaygroundEntry, type PlaygroundSendArgs,
} from '../../../../shared/voicePlayground'
import type { LeadRequest, LeadStreamEvent, ModelAdapter } from '../../../contract'
import { KEEP_LISTENING } from '../../../lead/voiceLogic'
import { PlaygroundConversation } from '../conversation'
import { registerVoicePlayground, type PlaygroundSocket } from '../handlers'
import { fakeLead, leadFor } from '../leads'

const usage = { inputTokens: 7, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 }
const finish: LeadStreamEvent = { type: 'finish', reason: 'stop', usage }
const call = (name: string, input: unknown): LeadStreamEvent => ({ type: 'tool-call', call: { id: `c-${name}`, name, input } })

function scripted(steps: LeadStreamEvent[][]): ModelAdapter & { requests: LeadRequest[] } {
  const requests: LeadRequest[] = []
  return {
    requests,
    async *stream(request) {
      requests.push(request)
      for (const e of steps.shift() ?? []) yield e
    },
    async complete() { throw new Error('not used') },
  }
}

const access = { providerId: 'p1', providerName: 'Test', provider: 'openrouter' as const, model: 'flash', apiKey: 'fake' }
const flush = () => new Promise(r => setTimeout(r, 0))

function playground(steps: LeadStreamEvent[][] = []) {
  const sent: { event: string; payload: unknown }[] = []
  const said: string[] = []
  const model = scripted(steps)
  let t = 1_000
  const c = new PlaygroundConversation({
    out: (event, payload) => sent.push({ event, payload }),
    lead: args => leadFor(args.lead, 'u1', { model, access: async () => access, cacheKey: 'k', wait: async () => undefined }),
    speech: async () => ({
      async *synthesize(text: string) { said.push(text); yield { audio: Buffer.alloc(480) } },
      phrases: async (onClip, stillWanted) => { if (stillWanted()) onClip({ text: 'Mm.', tier: 0, audio: Buffer.alloc(2), use: 'active-listening' }) },
    }),
    log: () => undefined,
    now: () => (t += 100),
    wait: async () => undefined,
    every: () => () => undefined,
  })
  const of = (event: string) => sent.filter(s => s.event === event).map(s => s.payload)
  const entries = () => {
    const byId = new Map<string, PlaygroundEntry>()
    for (const e of of(P.entry) as PlaygroundEntry[]) byId.set(e.id, e)
    return [...byId.values()]
  }
  const send = (text: string, extra: Partial<PlaygroundSendArgs> = {}) => c.send({
    conversationId: ID, clientMessageId: `cm-${text}`, text, lead: { kind: 'model', model: 'p1/flash' }, adaptiveVoice: true, ...extra,
  })
  return { c, sent, said, model, of, entries, send }
}

async function settle() { for (let i = 0; i < 10; i++) await flush() }

describe('the playground conversation @SC-1840', () => {
  it('answers a typed message with the model, streamed to the page, its usage as a development call', async () => {
    const p = playground([[{ type: 'text', text: 'Two of them.' }, finish]])
    expect(p.send('How many projects?')).toMatchObject({ ok: true })
    await settle()
    const agent = p.entries().find(e => e.role === 'agent')!
    expect(agent).toMatchObject({ text: 'Two of them.', state: 'COMPLETED' })
    expect(p.of(pe(CONVERSATION_SOCKET.delta))).toEqual([{ conversationId: ID, turnId: agent.turnId, offset: 0, text: 'Two of them.' }])
    expect(p.of(P.usage)).toEqual([{ turnId: agent.turnId, model: 'p1/flash', inputTokens: 7, outputTokens: 3 }])
    // Typed, with voice off: the lead's own context with no voice turn block, and no spoken reasoning.
    const request = p.model.requests[0]!
    expect(request.system.map(s => s.text).join('\n')).toMatch(/Kernel/)
    expect(JSON.stringify(request.messages)).not.toMatch(/voice conversation/)
    expect(request.spoken).toBeUndefined()
    expect(request.tools.map(t => t.name)).toEqual(['start_work', KEEP_LISTENING])
  })

  it('speaks a reply through hq\'s voice session while voice is on, after the stored phrases', async () => {
    const p = playground([[{ type: 'text', text: 'Yes. It is Tuesday.' }, finish]])
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    expect(p.of(pe(V.state))).toEqual([expect.objectContaining({ holderId: 'playground-person' })])
    expect(p.of(pe(V.phrase))).toEqual([expect.objectContaining({ text: 'Mm.', use: 'active-listening' })])
    p.send('Which day is it', { spoken: true })
    await settle()
    expect(p.said).toEqual(['Yes.', 'It is Tuesday.'])
    expect(p.of(pe(V.sentence)).map(s => (s as { text: string }).text)).toEqual(['Yes.', 'It is Tuesday.'])
    expect(p.of(pe(V.turnSpoken))).toHaveLength(1)
    const request = p.model.requests[0]!
    expect(JSON.stringify(request.messages)).toMatch(/First judge whether they have finished their thought/)
    expect(request).toMatchObject({ spoken: true, firstSpokenStep: true })
  })

  it('keeps a stored clip the person heard as the agent\'s words, which the lead then reads, and starts no turn', async () => {
    const p = playground([[{ type: 'text', text: 'Go ahead.' }, finish]])
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.send('So what I wanted to say is', { spoken: true })
    p.c.recordSound({ conversationId: ID, text: 'Mm-hm.', sound: 'hum' })
    p.c.recordSound({ conversationId: ID, text: 'x'.repeat(300), sound: 'hum' })
    p.c.recordSound({ conversationId: ID, text: 'Hi', sound: 'shout' })
    p.c.recordSound({ conversationId: 'other', text: 'Hi', sound: 'hum' })
    await settle()
    const sounds = p.entries().filter(e => e.sound)
    expect(sounds).toEqual([expect.objectContaining({ role: 'agent', text: 'Mm-hm.', sound: 'hum', spoken: true, state: 'COMPLETED' })])
    expect(p.model.requests).toHaveLength(1)
    p.send('Okay, it is this', { spoken: true })
    await settle()
    expect(JSON.stringify(p.model.requests.at(-1)!.messages)).toMatch(/Mm-hm\./)
  })

  it('keeps no clip while voice is off', () => {
    const p = playground()
    p.c.recordSound({ conversationId: ID, text: 'Mm-hm.', sound: 'hum' })
    expect(p.entries()).toEqual([])
  })

  it('holds an unfinished spoken message: nothing said, the holder told, the decision and its reason on the page', async () => {
    const p = playground([[call(KEEP_LISTENING, { reason: 'ended on "and"' }), finish]])
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.send('So I was thinking and', { spoken: true })
    await settle()
    const agent = p.entries().find(e => e.role === 'agent')!
    expect(agent).toMatchObject({ text: '', state: 'COMPLETED', withdrawn: true })
    expect(p.of(pe(V.turnHeld))).toEqual([{ conversationId: ID, turnId: agent.turnId }])
    expect(p.of(P.decision)).toEqual([expect.objectContaining({ turnId: agent.turnId, kind: 'held', text: 'ended on "and"' })])
    expect(p.said).toEqual([])
  })

  it('joins their next words to a held message, and tells the next turn they went on', async () => {
    const p = playground([[call(KEEP_LISTENING, { reason: 'ended on "and"' }), finish], [{ type: 'text', text: 'Got it.' }, finish]])
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.send('So I was thinking and', { spoken: true })
    await settle()
    const held = p.entries().find(e => e.role === 'agent')!
    p.c.voiceEvent(V.continue, { conversationId: ID, turnId: held.turnId, text: 'we could ship Friday.' })
    await settle()
    const person = p.entries().filter(e => e.role === 'person')
    expect(person).toHaveLength(1)
    expect(person[0]!.text).toBe('So I was thinking and we could ship Friday.')
    expect(JSON.stringify(p.model.requests[1]!.messages)).toMatch(/They paused mid-thought earlier and went on/)
    expect(p.entries().filter(e => e.role === 'agent').at(-1)).toMatchObject({ text: 'Got it.' })
  })

  it('discards what was written for a message the person went on from before any of it was heard', async () => {
    const p = playground([[{ type: 'text', text: 'First answer, never heard.' }, finish], [{ type: 'text', text: 'Answer to all of it.' }, finish]])
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.send('So what is the hum', { spoken: true })
    const first = p.entries().find(e => e.role === 'agent')!
    await settle()
    p.c.voiceEvent(V.continue, { conversationId: ID, turnId: first.turnId, text: 'if not the hum' })
    await settle()
    const agents = p.entries().filter(e => e.role === 'agent')
    expect(agents[0]).toMatchObject({ text: '', withdrawn: true })
    expect(agents.at(-1)).toMatchObject({ text: 'Answer to all of it.' })
    expect(JSON.stringify(p.model.requests.at(-1)!.messages)).not.toMatch(/First answer, never heard/)
  })

  it('shows an opening sentence and work started, which runs nothing @SC-1831', async () => {
    const p = playground([[{ type: 'text', text: "I'll look into the stale tasks." }, call('start_work', { title: 'Stale tasks', brief: 'x' }), finish]])
    p.send('Find the stale tasks', { spoken: true })
    await settle()
    expect(p.of(P.decision)).toEqual([expect.objectContaining({ kind: 'work', text: 'Stale tasks' })])
    expect(p.entries().find(e => e.role === 'agent')).toMatchObject({ text: "I'll look into the stale tasks.", state: 'COMPLETED' })
  })

  it('passes the Adaptive voice switch to the voice turn block', async () => {
    const p = playground([[finish]])
    p.c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    p.send('Find the stale tasks', { spoken: true, adaptiveVoice: false })
    await settle()
    expect(JSON.stringify(p.model.requests[0]!.messages)).not.toMatch(/begin it with one short sentence/)
  })

  it('says why voice cannot start when there is no text to speech', async () => {
    const sent: { event: string; payload: unknown }[] = []
    const c = new PlaygroundConversation({ out: (event, payload) => sent.push({ event, payload }), lead: () => fakeLead({}), speech: async () => ({ reason: 'Voice is not set up.' }), log: () => undefined })
    c.voiceEvent(V.start, { conversationId: ID })
    await settle()
    expect(sent).toEqual([{ event: pe(V.error), payload: { conversationId: ID, message: 'Voice is not set up.' } }])
  })

  it('refuses a message with no words, or no lead it can make', () => {
    const p = playground()
    expect(p.send('   ')).toMatchObject({ ok: false })
    expect(p.send('hi', { lead: { kind: 'other' } as never })).toEqual({ ok: false, error: 'Choose who answers: the fake model or a model.' })
  })
})

describe('the fake lead @SC-1840', () => {
  it('waits the delay set on the page, at most two minutes, then streams its text in pieces', async () => {
    const waited: number[] = []
    const lead = fakeLead({ delayMs: 10_000_000, text: 'One two three four five.' }, async ms => { waited.push(ms) })
    const pieces: string[] = []
    for await (const e of lead.events({} as never, new AbortController().signal)) if (e.type === 'text') pieces.push(e.text)
    expect(waited[0]).toBe(120_000)
    expect(pieces.join('')).toBe('One two three four five.')
    expect(lead.model).toBeNull()
  })
})

describe('the playground socket @SC-1840', () => {
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
  const make = () => ({ lead: () => fakeLead({ delayMs: 0 }, async () => undefined), speech: async () => ({ reason: 'none' }), log: () => undefined })
  const args = { conversationId: ID, clientMessageId: 'c', text: 'hi', lead: { kind: 'fake', delayMs: 0 }, adaptiveVoice: true }

  it('is refused outside a development build, and for a socket of nobody signed in', () => {
    for (const [userId, env] of [['u1', { NODE_ENV: 'production' }], [undefined, { NODE_ENV: 'development' }]] as const) {
      const { s, handlers, emitted } = socket(userId)
      registerVoicePlayground(s, log, make, env)
      const acks: unknown[] = []
      handlers.get(P.send)!(args, (a: unknown) => acks.push(a))
      handlers.get(pe(V.start))!({ conversationId: ID })
      expect(acks).toEqual([{ ok: false, error: PLAYGROUND_REFUSED }])
      expect(emitted).toEqual([{ event: pe(V.error), payload: { conversationId: ID, message: PLAYGROUND_REFUSED } }])
    }
  })

  it('in development, answers a signed-in person on their own socket only, under the playground\'s names', async () => {
    const { s, handlers, emitted } = socket('u1')
    registerVoicePlayground(s, log, make, { NODE_ENV: 'development' })
    const acks: unknown[] = []
    handlers.get(P.send)!(args, (a: unknown) => acks.push(a))
    await settle()
    expect(acks).toEqual([{ ok: true, entryId: expect.any(String) }])
    expect(emitted.some(e => e.event === pe(CONVERSATION_SOCKET.turn))).toBe(true)
    expect(emitted.every(e => e.event.startsWith('voicePlayground:'))).toBe(true)
    expect((emitted.filter(e => e.event === P.decision) as { payload: PlaygroundDecision }[])).toEqual([])
  })

  it('writes the page\'s trace line to the log, in development for a signed-in person, capped', () => {
    const lines: string[] = []
    const talking = { info: (m: string) => lines.push(m), error: () => undefined }
    for (const [userId, env] of [['u1', { NODE_ENV: 'development' }], ['u1', { NODE_ENV: 'production' }], [undefined, { NODE_ENV: 'development' }]] as const) {
      const { s, handlers } = socket(userId)
      registerVoicePlayground(s, talking, make, env)
      handlers.get(P.trace)!('9.5s asked for a sound: hum' + 'x'.repeat(400))
    }
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^voice playground: page 9\.5s asked for a sound: hum/)
    expect(lines[0]!.length).toBeLessThan(400)
  })
})
