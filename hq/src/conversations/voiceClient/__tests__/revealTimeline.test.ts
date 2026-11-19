/**
 * The agent's bubble through a turn the light model handed over, driven through the whole voice client in the order hq
 * sends it: the hand-over and its hold line, the turn running and its text, the lines heard that head its message, the
 * reply's sentences and audio, and the stored message. At each step, what the bubble shows, as the playground draws it
 * (`Transcript` → `revealOf`) and as the conversation panel draws it (`spokenReveal`, on the stream then the message).
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V } from '@agenthix/core'
import { revealOf } from '../../../shared/providers/VoiceCallProvider'
import { REVEAL } from '../../../shared/components/reveal/pace'
import { replyTextOf, revealedText, spokenReveal } from '../reveal'
import { lightRig, speech, type LightRig } from './lightRig'
import { C } from './sessionRig'

const HOLD = 'Let me check that.'
const FIRST = 'It is sunny today.'
const SECOND = 'Bring a hat.'
const REPLY = `${FIRST} ${SECOND}`
const STORED = `${HOLD}\n\n${REPLY}`
const PLAY_MS = 2_000

/** The playground's bubble for its entry's text. */
function playground(r: LightRig, entryText: string, turnId = 't1'): string {
  const { text, limit } = revealOf(r.session.snapshot(), turnId, entryText)
  return revealedText(text, limit)
}

/** The panel's bubble: the reply streaming in (or nothing yet), or its stored message. */
function panel(r: LightRig, text: string, turnId = 't1'): string {
  const snap = r.session.snapshot()
  const shown = replyTextOf(snap, turnId, text)
  const at = spokenReveal(snap.reveal, turnId, shown, REVEAL.leadMs / 1000, snap.heading)
  return at ? shown.slice(0, Math.floor(at.target)) : shown
}

function sentences(r: LightRig) {
  let at = 0
  ;[FIRST, SECOND].forEach((text, index) => {
    const words = text.split(' ')
    r.receive(V.sentence, {
      conversationId: C, turnId: 't1', index, text, textStart: at, textEnd: at + text.length, words,
      wordStartSecs: words.map((_, i) => i * 0.3), wordEndSecs: words.map((_, i) => i * 0.3 + 0.25),
    })
    at += text.length + 1
    r.receive(V.audio, { conversationId: C, turnId: 't1', index, audio: new ArrayBuffer(8) })
  })
}

async function handOver(r: LightRig) {
  await r.start()
  await r.hear(speech(5))
  await r.silence(1_500)
  r.answer({ seq: r.listens().at(-1)!.seq, action: 'hand_over', say: HOLD, lineId: 'L1', turn: 'handedOver', nextCheckSecs: 2 })
  r.line('L1', HOLD)
  await r.advance(100)
  expect(r.linesStarted()).toEqual([HOLD])
}

describe('a handed-over turn, step by step', () => {
  it('shows the hold as it plays, then the reply only with its voice, never whole ahead of it nor collapsed back', async () => {
    const r = lightRig({ playMs: PLAY_MS })
    await handOver(r)

    // The turn runs: the bubble appears with the hold being heard, not "…".
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'RUNNING' })
    await r.advance(50)
    expect(playground(r, '')).toBe(HOLD)
    expect(panel(r, '')).toBe(HOLD)

    // The reply is written while the hold plays: its words stay hidden.
    r.receive(CONVERSATION_SOCKET.delta, { conversationId: C, turnId: 't1', offset: 0, text: REPLY })
    sentences(r)
    await r.advance(50)
    expect(playground(r, REPLY)).toBe(HOLD)
    expect(panel(r, REPLY)).toBe(HOLD)

    // hq ends the turn before the reply is heard: the lines heard, the turn completed, the reply spoken, the message stored.
    r.receive(V.heardPrefix, { conversationId: C, turnId: 't1', text: HOLD })
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'COMPLETED' })
    r.receive(V.turnSpoken, { conversationId: C, turnId: 't1', sentences: 2 })
    await r.advance(50)
    expect(r.session.snapshot().phase).not.toBe('speaking')
    expect(playground(r, STORED)).toBe(HOLD)
    expect(panel(r, REPLY)).toBe(HOLD)
    expect(panel(r, STORED)).toBe(HOLD)

    // The hold ends and the reply's voice begins: its words follow the voice, never shown whole ahead of it, never fewer.
    let lastPlayground = HOLD.length
    let lastPanel = HOLD.length
    let spoke = false
    let sawReply = false
    for (let i = 0; i < 50; i++) {
      await r.advance(100)
      const p = playground(r, STORED)
      const q = panel(r, STORED)
      expect(p.startsWith(HOLD)).toBe(true)
      expect(q.startsWith(HOLD)).toBe(true)
      expect(p.length).toBeGreaterThanOrEqual(lastPlayground)
      expect(q.length).toBeGreaterThanOrEqual(lastPanel)
      const speaking = r.session.snapshot().phase === 'speaking'
      spoke ||= speaking
      // Before the voice, the hold alone; while it speaks (only its first sentence plays here), never the second sentence.
      if (!spoke) expect(p).toBe(HOLD)
      if (speaking) {
        expect(p).not.toContain('Bring')
        if (p.length > HOLD.length) sawReply = true
      }
      lastPlayground = p.length
      lastPanel = q.length
    }
    expect(spoke).toBe(true)
    expect(sawReply).toBe(true)
  })

  it('the words follow the voice at the right place when the turn completes while the reply waits for the hold', async () => {
    const r = lightRig({ playMs: PLAY_MS })
    await handOver(r)
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'RUNNING' })
    r.receive(CONVERSATION_SOCKET.delta, { conversationId: C, turnId: 't1', offset: 0, text: REPLY })
    sentences(r)
    r.receive(V.heardPrefix, { conversationId: C, turnId: 't1', text: HOLD })
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'COMPLETED' })
    r.receive(V.turnSpoken, { conversationId: C, turnId: 't1', sentences: 2 })
    await r.advance(PLAY_MS + 100)
    expect(r.session.snapshot().phase).toBe('speaking')
    // 0.4 s into the first sentence: its first two words have started.
    while ((r.session.snapshot().reveal?.head?.elapsed ?? 0) < 0.4) await r.advance(20)
    expect(playground(r, STORED)).toBe(`${HOLD}\n\nIt is`)
    expect(r.session.snapshot().reveal?.heardPrefix).toBe(HOLD)
  })

  it('a line that closed a turn alone is in that turn\'s message: it never heads the next reply', async () => {
    const r = lightRig({ playMs: PLAY_MS })
    await r.start()
    await r.hear(speech(2))
    await r.silence(1_500)
    r.answer({ seq: r.listens().at(-1)!.seq, action: 'close_turn', say: "You're welcome.", lineId: 'L1', turn: 'closed', turnId: 't9' })
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't9', state: 'RUNNING' })
    r.line('L1', "You're welcome.")
    await r.advance(100)
    // The closing line heads its own turn's message, as it begins.
    expect(r.session.snapshot().heading).toMatchObject({ turnId: 't9', heard: "You're welcome." })
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't9', state: 'COMPLETED' })
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'RUNNING' })
    await r.advance(PLAY_MS)
    expect(r.session.snapshot().heading ?? null).toBeNull()
    expect(playground(r, '')).toBe('')
  })

  it('four hand-overs, each reply cut by the person while it plays: each bubble heads with its own hold only', async () => {
    const holds = ['Of course, once more.', 'Right, one more time.', 'Sure, again.', 'Okay, running through it.']
    const r = lightRig({ playMs: PLAY_MS })
    await r.start()
    for (let i = 0; i < holds.length; i++) {
      const turnId = `t${i + 1}`
      const hold = holds[i]!
      await r.hear(speech(3, i * 10))
      await r.silence(1_500)
      r.answer({ seq: r.listens().at(-1)!.seq, action: 'hand_over', say: hold, lineId: `L${i + 1}`, turn: 'handedOver', nextCheckSecs: 2 })
      r.line(`L${i + 1}`, hold)
      await r.advance(100)
      r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId, state: 'RUNNING' })
      await r.advance(50)
      expect(playground(r, '', turnId)).toBe(hold)
      expect(panel(r, '', turnId)).toBe(hold)
      r.receive(CONVERSATION_SOCKET.delta, { conversationId: C, turnId, offset: 0, text: REPLY })
      await r.advance(50)
      expect(playground(r, REPLY, turnId)).toBe(hold)
      expect(panel(r, REPLY, turnId)).toBe(hold)
      r.reply(turnId, REPLY)
      r.receive(V.heardPrefix, { conversationId: C, turnId, text: hold })
      r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId, state: 'COMPLETED' })
      // The hold ends and the reply plays; the person says a stop word over it.
      await r.advance(PLAY_MS + 300)
      expect(r.session.snapshot().phase).toBe('speaking')
      r.session.runtime()!.publish({ kind: 'orchestration.playback', action: 'stop', replyId: turnId, by: 'stop-word', t: r.clock.now() })
      await r.advance(50)
      expect(r.interrupts().at(-1)?.[1]).toMatchObject({ turnId })
      expect(r.session.snapshot().heading ?? null).toBeNull()
    }
  })

  it('a reply hq held leaves its hold to head the reply that answers again', async () => {
    const r = lightRig({ playMs: PLAY_MS })
    await handOver(r)
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't0', state: 'RUNNING' })
    r.receive(V.turnHeld, { conversationId: C, turnId: 't0' })
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't0', state: 'COMPLETED' })
    await r.advance(50)
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'RUNNING' })
    await r.advance(50)
    expect(playground(r, '')).toBe(HOLD)
  })

  it('plain voice: no lines, the bubble is empty until the voice, as before', async () => {
    const r = lightRig({ voiceListener: false, adaptiveVoice: false })
    await r.start()
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'RUNNING' })
    r.receive(CONVERSATION_SOCKET.delta, { conversationId: C, turnId: 't1', offset: 0, text: REPLY })
    await r.advance(50)
    expect(r.session.snapshot().heading ?? null).toBeNull()
    expect(playground(r, REPLY)).toBe('')
    expect(panel(r, REPLY)).toBe('')
  })
})
