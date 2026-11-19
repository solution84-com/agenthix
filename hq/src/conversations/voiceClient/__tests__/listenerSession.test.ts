/**
 * The light model listening, replayed end to end through every layer of the voice client (adaptive voice listening,
 * spec §The light model → *When it is asked* and *How its words are played*, §When a turn ends): what goes to hq as
 * `listen`, and what plays of its answers.
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V } from '@agenthix/core'
import { VOICE_SETTINGS } from '../settings'
import { lightRig, PLAY_MS, speech } from './lightRig'
import { C } from './sessionRig'

describe('the light model asked, end to end', () => {
  it('a finished question goes with the sounds finished call, and nothing else sends it', async () => {
    const r = lightRig()
    await r.start()
    await r.hear(speech(5))
    await r.silence(3_000)
    const finished = r.listens().filter(l => l.moment === 'soundsFinished')
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatchObject({ conversationId: C, text: 'w0 w1 w2 w3 w4' })
    expect(r.listens().map(l => l.seq)).toEqual(r.listens().map((_, i) => i + 1))
    expect(r.sent()).toEqual([])
    expect(r.session.snapshot()).toMatchObject({ phase: 'thinking', partial: 'w0 w1 w2 w3 w4' })
  })

  it('handed over: the hold plays to its end and hq hears so, the reply waits for it, and the wait is checked until the reply plays @SC-2203 @SC-2210', async () => {
    const r = lightRig()
    await r.start()
    await r.hear(speech(5))
    await r.silence(1_500)
    const seq = r.listens().at(-1)!.seq
    r.answer({ seq, action: 'hand_over', say: 'Let me check that.', lineId: 'L1', turn: 'handedOver', nextCheckSecs: 2 })
    r.line('L1', 'Let me check that.')
    await r.advance(100)
    expect(r.session.snapshot()).toMatchObject({ partial: '', phase: 'thinking' })
    expect(r.linesStarted()).toEqual(['Let me check that.'])
    // A fast reply comes while the hold plays: it waits.
    r.reply('t1', 'It is sunny.')
    await r.advance(200)
    expect(r.session.snapshot().phase).toBe('thinking')
    await r.advance(PLAY_MS)
    expect(r.playedLines()).toEqual(['Let me check that.'])
    expect(r.linePlayed()).toEqual(['L1'])
    expect(r.session.snapshot().phase).toBe('speaking')
    await r.advance(5_000)
    expect(r.listens().filter(l => l.moment === 'working')).toEqual([])
  })

  it('while the reply is worked out, it asks at next check with how long the wait has lasted @SC-2213', async () => {
    const r = lightRig()
    await r.start()
    await r.hear(speech(5))
    await r.silence(1_500)
    r.answer({ seq: r.listens().at(-1)!.seq, action: 'hand_over', say: 'Let me look.', lineId: 'L1', turn: 'handedOver', nextCheckSecs: 3 })
    await r.advance(3_100)
    const working = r.listens().filter(l => l.moment === 'working')
    expect(working).toHaveLength(1)
    expect(working[0]).toMatchObject({ text: '' })
    expect(working[0]!.workingMs).toBeGreaterThanOrEqual(3_000)
    r.reply('t1', 'Found it.')
    await r.advance(10_000)
    expect(r.listens().filter(l => l.moment === 'working')).toHaveLength(1)
  })

  it('closed: its line plays, no reply is awaited, and the next words begin a new turn @SC-2203', async () => {
    const r = lightRig()
    await r.start()
    await r.hear(speech(2))
    await r.silence(1_500)
    r.answer({ seq: r.listens().at(-1)!.seq, action: 'close_turn', say: "You're welcome.", lineId: 'L1', turn: 'closed', turnId: 't9' })
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't9', state: 'COMPLETED' })
    r.line('L1', "You're welcome.")
    await r.advance(PLAY_MS + 100)
    expect(r.playedLines()).toEqual(["You're welcome."])
    expect(r.session.snapshot().phase).toBe('listening')
    await r.hear(speech(3, 10))
    await r.silence(1_500)
    expect(r.listens().filter(l => l.moment === 'soundsFinished').at(-1)!.text).toBe('w10 w11 w12')
    expect(r.sent()).toEqual([])
  })

  it('not yet: the turn stays open, a line said over the person is never cut nor a barge-in, and their next words join it @SC-2199 @SC-2208', async () => {
    const r = lightRig({ playMs: 2_500 })
    await r.start()
    await r.hear(speech(3))
    await r.silence(1_200)
    r.answer({ seq: r.listens().at(-1)!.seq, action: 'acknowledge', say: 'Right.', lineId: 'L1', nextCheckSecs: 5 })
    r.line('L1', 'Right.')
    await r.advance(50)
    expect(r.session.snapshot().phase).toBe('listening')
    await r.hear(speech(2, 10))
    await r.silence(1_500)
    await r.advance(1_000)
    const line = r.made.find(m => m.state.enqueued === 1)!
    expect(line.state.closedEarly).toBe(0)
    expect(r.linePlayed()).toEqual(['L1'])
    expect(r.of('orchestration.playback')).toEqual([])
    expect(r.interrupts()).toEqual([])
    expect(r.listens().filter(l => l.moment === 'soundsFinished').at(-1)!.text).toBe('w0 w1 w2 w10 w11')
    expect(r.sent()).toEqual([])
  })

  it('a kept-open turn is re-checked at next check while the person stays quiet @SC-2205', async () => {
    const r = lightRig()
    await r.start()
    await r.hear(speech(3))
    await r.silence(1_200)
    r.answer({ seq: r.listens().at(-1)!.seq, nextCheckSecs: 4 })
    await r.advance(4_100)
    expect(r.listens().at(-1)).toMatchObject({ moment: 'quiet', keptOpen: true, text: 'w0 w1 w2' })
  })

  it('the fallback: its stored phrase, which comes before the answer, plays @SC-2211', async () => {
    const r = lightRig()
    await r.start()
    await r.hear(speech(3))
    await r.silence(1_200)
    r.line('S1', 'Okay, bear with me.', true)
    r.answer({ seq: r.listens().at(-1)!.seq, turn: 'fallback', say: 'Okay, bear with me.', lineId: 'S1' })
    await r.advance(PLAY_MS + 100)
    expect(r.playedLines()).toEqual(['Okay, bear with me.'])
    expect(r.linePlayed()).toEqual(['S1'])
  })

  it('a line due while the reply plays is dropped, and hq is told it was skipped, never played @SC-2210', async () => {
    const r = lightRig()
    await r.start()
    await r.hear(speech(3))
    await r.silence(1_200)
    await r.hear(speech(2, 10))
    await r.silence(1_500)
    const seq = r.listens().at(-1)!.seq
    expect(seq).toBeGreaterThanOrEqual(2)
    r.answer({ seq, action: 'hand_over', turn: 'handedOver', nextCheckSecs: 2 })
    r.reply('t1', 'It is sunny in Melbourne today.')
    await r.advance(100)
    expect(r.session.snapshot().phase).toBe('speaking')
    // A late answer to the call before: its acknowledgement comes due while the reply plays.
    r.answer({ seq: 1, action: 'acknowledge', say: 'Right.', lineId: 'L9' })
    r.line('L9', 'Right.')
    await r.advance(PLAY_MS + 100)
    expect(r.playedLines()).toEqual([])
    expect(r.lineSkipped()).toEqual(['L9'])
    expect(r.linePlayed()).toEqual([])
    expect(r.emitted.find(e => e[0] === V.linePlayed)![1]).toEqual({ conversationId: C, lineId: 'L9', skipped: true })
  })

  it('a stale answer plays nothing: the person spoke after its call, so even its acknowledgement is dropped @SC-2229', async () => {
    const r = lightRig()
    await r.start()
    await r.hear(speech(3))
    await r.silence(1_200)
    await r.hear(speech(2, 10))
    await r.silence(1_200)
    expect(r.listens().length).toBeGreaterThanOrEqual(2)
    r.answer({ seq: 1, action: 'invite', say: 'Go on.', lineId: 'L0' })
    r.answer({ seq: 1, action: 'acknowledge', say: 'I see.', lineId: 'L1' })
    // The same answer delivered again is read once.
    r.answer({ seq: 1, action: 'acknowledge', say: 'I see.', lineId: 'L1' })
    r.line('L0', 'Go on.')
    r.line('L1', 'I see.')
    await r.advance(PLAY_MS + 100)
    expect(r.playedLines()).toEqual([])
    expect(r.lineSkipped()).toEqual(['L1'])
  })

  it('the agent\'s line heard back is not written down as the person\'s words @SC-2209', async () => {
    const said = ['let', 'me', 'check', 'that']
    const r = lightRig({ service: { textOf: i => said[i] ?? `w${i}` }, playMs: 3_000 })
    await r.start()
    r.receive(V.line, { conversationId: C, lineId: 'L1', text: 'Let me check that.', audio: new ArrayBuffer(8) })
    // The line was allowed by an answer to a call this voice made.
    await r.hear(speech(2, 20))
    await r.silence(1_500)
    r.answer({ seq: r.listens().at(-1)!.seq, action: 'hand_over', say: 'Let me check that.', lineId: 'L1', turn: 'handedOver' })
    await r.advance(50)
    const before = r.of('stt.person').length
    await r.hear(speech(4))
    await r.silence(2_000)
    expect(r.of('stt.person').slice(before).filter(e => e.text)).toEqual([])
    expect(r.listens().some(l => /let me/.test(l.text))).toBe(false)
  })

  it('the person heard over a loud line is still written down, and their words still reach the light model @SC-2209', async () => {
    const r = lightRig({ playMs: 4_000, vad: frame => (frame.some(x => x !== 0) ? 0.95 : 0.02) })
    await r.start()
    await r.hear(speech(3))
    await r.silence(1_200)
    r.answer({ seq: r.listens().at(-1)!.seq, action: 'acknowledge', say: 'Right, I see.', lineId: 'L1', nextCheckSecs: 10 })
    r.line('L1', 'Right, I see.')
    await r.advance(50)
    // The line is loud at the microphone: what the person says is heard against it.
    const loud = new Int16Array(512).fill(20_000)
    for (const m of r.made) m.state.played = () => loud
    await r.hear(speech(3, 10))
    await r.silence(VOICE_SETTINGS.pause.capMs + 2_000)
    expect(r.of('stt.person').some(e => e.text.includes('w10'))).toBe(true)
    expect(r.listens().some(l => l.text.includes('w10 w11 w12'))).toBe(true)
  })

  it('its lines and checks do not keep a silent voice alive', async () => {
    const r = lightRig()
    await r.start()
    await r.hear(speech(3))
    await r.silence(1_200)
    const activity = r.emitted.filter(e => e[0] === V.activity).length
    r.answer({ seq: r.listens().at(-1)!.seq, action: 'acknowledge', say: 'Right.', lineId: 'L1', nextCheckSecs: 1 })
    r.line('L1', 'Right.')
    await r.advance(6_000)
    expect(r.listens().length).toBeGreaterThanOrEqual(2)
    expect(r.emitted.filter(e => e[0] === V.activity).length).toBe(activity)
  })

  it('voice ends between a hand over and its reply: nothing of that turn reaches the next voice', async () => {
    const r = lightRig()
    await r.start()
    await r.hear(speech(3))
    await r.silence(1_200)
    r.answer({ seq: r.listens().at(-1)!.seq, action: 'hand_over', say: 'Let me look.', lineId: 'L1', turn: 'handedOver' })
    r.session.end()
    await r.advance(100)
    const before = r.listens().length
    await r.start()
    r.line('L1', 'Let me look.')
    r.answer({ seq: 1, action: 'acknowledge', say: 'Right.', lineId: 'L2' })
    await r.hear(speech(2, 10))
    await r.silence(1_500)
    const next = r.listens().slice(before)
    expect(next[0]!.seq).toBe(1)
    expect(next.every(l => !l.text.includes('w0'))).toBe(true)
    expect(r.linesStarted()).toEqual([])
  })
})

