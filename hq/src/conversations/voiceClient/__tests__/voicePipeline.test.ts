/**
 * The whole of voice, replayed end to end (adaptive voice spec, How it is built and tested: replay tests): the
 * person's audio into the microphone, through silence detection, the speech connection, the turn decision and the
 * floor, to what hq is sent and what playback does, on a fake clock. Only what is outside the page is a fake.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/protocol'
import { script } from '../stt/__tests__/transcribing'
import { C, rig, type Rig } from './sessionRig'

const words = (list: string[]) => (index: number) => list[index] ?? `w${index}`

/** When the person's voice last ended, by silence detection. */
const lastSilenceAt = (r: Rig) => r.of('acoustic.silence').filter(e => e.silent).at(-1)!.t

describe('the whole pipeline, replayed @SC-995', () => {
  it('a question: answered as one message soon after the person stops, without a fixed wait', async () => {
    const r = rig({ turnScores: [0.95] })
    await r.start()
    await r.hear(script([[5, 0]], 8, 300).audio)
    await r.silence(1_500)
    expect(r.sent()).toEqual(['w0 w1 w2 w3 w4'])
    const ready = r.of('semantics.decision').find(d => d.answer === 'READY')!
    expect(ready).toMatchObject({ by: 'model', silenceMs: 500 })
    const sentAt = r.of('orchestration.send')[0]!.t
    // READY at 500 ms of silence, then STT's finished turn, which the fake sends 300 ms after it is asked.
    expect(sentAt - lastSilenceAt(r)).toBeLessThan(900)
    expect(r.session.snapshot()).toMatchObject({ phase: 'thinking', partial: '' })

    r.reply('t1', ['It is green.'])
    await r.advance(200)
    expect(r.session.snapshot().phase).toBe('speaking')
    r.replyEnds('t1', 1)
    await r.advance(200)
    expect(r.session.snapshot().phase).toBe('listening')
  })

  it('a hesitation: the floor is kept through the pause, and the whole is sent once', async () => {
    const r = rig({ turnScores: [0.03, 0.95] })
    await r.start()
    await r.hear(script([[3, 1_300], [3, 0]], 8, 300).audio)
    await r.silence(1_500)
    const firstPause = r.of('semantics.decision').filter(d => d.t < lastSilenceAt(r))
    expect(firstPause.map(d => d.answer)).toEqual(['UNCERTAIN', 'KEEP_LISTENING'])
    expect(r.sent()).toEqual(['w0 w1 w2 w3 w4 w5'])
    expect(r.asked()).toBe(2)
  })

  it('a barge-in: the reply is ducked at once, stopped by the person’s words, and their words are the next message', async () => {
    const r = rig({ service: { textOf: words(['hold', 'on', 'wait']) } })
    await r.start()
    r.reply('t1', ['Right now your plate is full.', 'There is one more thing.'])
    await r.advance(500)
    expect(r.session.snapshot().phase).toBe('speaking')
    const voiceFrom = r.clock.now()
    await r.hear(script([[3, 0]], 8, 0).audio)
    const duck = r.of('orchestration.playback').find(e => e.action === 'duck')!
    expect(duck.t - voiceFrom).toBeLessThan(350)
    expect(r.pb.state.ducked).toBe(1)
    await r.silence(1_500)
    expect(r.pb.state.stopped).toBe(1)
    expect(r.interrupts()).toEqual([[V.interrupt, { conversationId: C, turnId: 't1', heardThrough: 1 }]])
    const stop = r.of('orchestration.playback').find(e => e.action === 'stop')!
    expect(stop.t - voiceFrom).toBeLessThan(1_500)
    expect(r.sent()).toEqual(['hold on wait'])
  })

  it('a barge-in after the speech connection has closed for the agent’s long reply still stops it', async () => {
    const r = rig({ service: { textOf: words(['stop', 'please']) } })
    await r.start()
    r.reply('t1', ['A long answer.', 'And more of it.'])
    await r.silence(5_000)
    expect(r.of('stt.status').map(e => e.state)).toContain('idle')
    const voiceFrom = r.clock.now()
    await r.hear(script([[2, 0]], 8, 0).audio)
    await r.silence(2_500)
    const stop = r.of('orchestration.playback').find(e => e.action === 'stop')!
    expect(stop.t - voiceFrom).toBeLessThan(2_500)
    expect(r.sent()).toEqual(['stop please'])
  })

  it('an acknowledgement: the reply is ducked, then resumes, and nothing is sent', async () => {
    const r = rig({ service: { textOf: words(['yeah']) } })
    await r.start()
    r.reply('t1', ['Right now your plate is full.', 'There is one more thing.'])
    await r.advance(500)
    await r.hear(script([[1, 0]], 9, 0).audio)
    await r.silence(4_000)
    expect(r.pb.state.ducked).toBe(1)
    expect(r.pb.state.resumed).toBe(1)
    expect(r.pb.state.stopped).toBe(0)
    expect(r.interrupts()).toEqual([])
    expect(r.sent()).toEqual([])
    expect(r.session.snapshot().phase).toBe('speaking')
  })

  it('a stalled speech service: "Reconnecting…", a fresh connection, and the message whole', async () => {
    const r = rig()
    await r.start()
    const shown: boolean[] = []
    r.session.subscribe(() => { const now = r.session.snapshot().reconnecting === true; if (shown.at(-1) !== now) shown.push(now) })
    const { audio } = script([[12, 0]], 8, 300)
    const half = Math.floor(audio.length / 2 / 512) * 512
    await r.hear(audio.slice(0, half))
    r.fake.stall()
    await r.hear(audio.slice(half))
    // The fresh connection is given the backlog at the pace of speech: its words are about two seconds late.
    await r.silence(4_000)
    expect(r.of('stt.replace').map(e => e.reason)).toContain('queue-full')
    expect(shown).toEqual([false, true, false])
    expect(r.sent()).toEqual([Array.from({ length: 12 }, (_, i) => `w${i}`).join(' ')])
    // READY waited for the words to reach the end of the speech: none of them is left for a message of its own.
    expect(r.session.snapshot().partial).toBe('')
  })
})

describe('the whole pipeline: hq’s side of the floor @SC-995', () => {
  it('words that come before the reply is heard join the message just sent, as hq’s continue', async () => {
    const r = rig({ turnScores: [0.95] })
    await r.start()
    await r.hear(script([[3, 0]], 8, 300).audio)
    await r.silence(800)
    expect(r.sent()).toEqual(['w0 w1 w2'])
    r.receive(CONVERSATION_SOCKET.delta, { conversationId: C, turnId: 't1', offset: 0, text: 'Thinking' })
    await r.hear(script([[2, 0]], 8, 0).audio.map(x => (x === 0 ? 0 : x + 3)))
    await r.silence(1_000)
    expect(r.sent()).toEqual(['w0 w1 w2'])
    expect(r.emitted.filter(e => e[0] === V.continue)).toEqual([[V.continue, { conversationId: C, turnId: 't1', text: 'w3 w4' }]])
  })

  it('a raised hand chimes, shows its badge, and is invited once the floor has been open a while', async () => {
    const r = rig()
    await r.start()
    r.receive(V.update, { conversationId: C, updateId: 'card-1', critical: false })
    await r.advance(100)
    expect(r.session.snapshot().handRaise).toEqual({ updateId: 'card-1', critical: false })
    await r.silence(2_200)
    expect(r.emitted.filter(e => e[0] === V.invite)).toEqual([[V.invite, { conversationId: C, updateId: 'card-1' }]])
    expect(r.session.snapshot().handRaise).toBeNull()
  })
})
