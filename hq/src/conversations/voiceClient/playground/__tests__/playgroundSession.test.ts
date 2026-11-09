/**
 * The playground's voice session: hq's own voice client on the app's socket, with every voice and conversation event
 * under the playground's names, so the app's own voice and hq's voice service never see them.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_SOCKET } from '../../../../shared/conversations/protocol'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../../shared/conversations/voice'
import { PLAYGROUND_CONVERSATION_ID as ID, PLAYGROUND_REFUSED, VOICE_PLAYGROUND_SOCKET as P, playgroundEvent as pe } from '../../../../shared/voicePlayground'
import { makePlaygroundSession, playgroundSocket, sendToPlayground, type AckSocket } from '../playgroundSession'
import { VOICE_SETTINGS } from '../../settings'
import { DEFAULT_SETTINGS, createPlaygroundSettings, readSettings } from '../settings'

function fakeSocket(ack: unknown = { ok: true, entryId: 'e1' }) {
  const handlers = new Map<string, Set<(...args: never[]) => void>>()
  const emitted: { event: string; args: unknown[] }[] = []
  const socket: AckSocket = {
    on: (event, h) => { (handlers.get(event) ?? handlers.set(event, new Set()).get(event)!).add(h) },
    off: (event, h) => { handlers.get(event)?.delete(h) },
    emit: (event, ...args) => { emitted.push({ event, args }) },
    timeout: () => ({ emitWithAck: async (event, ...args) => { emitted.push({ event, args }); return ack } }),
  }
  const fire = (event: string, payload: unknown) => handlers.get(event)?.forEach(h => (h as (p: unknown) => void)(payload))
  return { socket, emitted, handlers, fire }
}

describe("the playground's socket @SC-1840", () => {
  it("carries hq's own events under the playground's names, both ways", () => {
    const f = fakeSocket()
    const s = playgroundSocket(f.socket)
    const seen: unknown[] = []
    const h = (e: unknown) => seen.push(e)
    s.on(V.sentence, h)
    s.emit(V.start, { conversationId: ID })
    f.fire(pe(V.sentence), { text: 'Hi.' })
    f.fire(V.sentence, { text: 'the app’s own' })
    s.off(V.sentence, h)
    f.fire(pe(V.sentence), { text: 'after off' })
    expect(f.emitted).toEqual([{ event: pe(V.start), args: [{ conversationId: ID }] }])
    expect(seen).toEqual([{ text: 'Hi.' }])
  })

  it('sends a message with the lead and the Adaptive voice switch chosen, and says why one was refused', async () => {
    const settings = createPlaygroundSettings(null)
    settings.patch({ lead: { kind: 'model', model: 'p1/flash' }, adaptiveVoice: false })
    const f = fakeSocket()
    await sendToPlayground(f.socket, settings, { conversationId: ID, clientMessageId: 'c', text: 'hi' })
    expect(f.emitted).toEqual([{ event: P.send, args: [{ conversationId: ID, clientMessageId: 'c', text: 'hi', lead: { kind: 'model', model: 'p1/flash' }, adaptiveVoice: false }] }])
    await expect(sendToPlayground(fakeSocket({ ok: false, error: PLAYGROUND_REFUSED }).socket, settings, { conversationId: ID, clientMessageId: 'c', text: 'hi' }))
      .rejects.toThrow(PLAYGROUND_REFUSED)
  })

  it("starts hq's voice client in the playground's conversation, which no hq event of the app reaches", () => {
    const f = fakeSocket()
    const session = makePlaygroundSession({ socket: f.socket, userId: 'u1', settings: createPlaygroundSettings(null), getToken: async () => ({ token: 't' }) as never })
    session.start(ID, { name: 'Agent', avatarUrl: null }, '/dev/voice-playground')
    expect(f.emitted.map(e => e.event)).toEqual([pe(V.start)])
    expect([...f.handlers.keys()].every(k => k.startsWith('voicePlayground:'))).toBe(true)
    expect(f.handlers.has(pe(CONVERSATION_SOCKET.turn))).toBe(true)
    // An error for the playground, as its server side sends one, ends the start with its line.
    f.fire(pe(V.error), { conversationId: ID, message: PLAYGROUND_REFUSED })
    expect(session.snapshot()).toMatchObject({ phase: 'off', notice: PLAYGROUND_REFUSED })
    session.dispose()
  })
})

describe("the playground's settings @SC-1840", () => {
  it('keep what was chosen, and fall back to the defaults for anything of another shape', () => {
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(readSettings('not json')).toEqual(DEFAULT_SETTINGS)
    expect(readSettings(JSON.stringify({ lead: { kind: 'model' }, adaptiveVoice: 'yes' }))).toEqual(DEFAULT_SETTINGS)
    const kept = new Map<string, string>()
    const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v) } }
    createPlaygroundSettings(storage).patch({ adaptiveVoice: false })
    expect(createPlaygroundSettings(storage).get()).toEqual({ ...DEFAULT_SETTINGS, adaptiveVoice: false })
  })
  it('keep the listening numbers chosen, each one of another shape falling back to its default', () => {
    const L = DEFAULT_SETTINGS.listening
    expect(readSettings(JSON.stringify({ listening: { minGapMs: 12_000, maxGapMs: 'long', recent: null } })).listening)
      .toEqual({ ...L, minGapMs: 12_000 })
  })

  it('move the numbers the running voice session reads, in place, so a slider takes effect at once', () => {
    const settings = createPlaygroundSettings(null)
    const live = settings.listening()
    expect(live.hums).toEqual(VOICE_SETTINGS.listening.hums)
    settings.patch({ listening: { ...settings.get().listening, minGapMs: 4_000, gainDb: -12 } })
    expect(settings.listening()).toBe(live)
    expect(live).toMatchObject({ minGapMs: 4_000, gainDb: -12, maxGapMs: VOICE_SETTINGS.listening.maxGapMs })
  })
})
