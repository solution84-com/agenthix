/**
 * Lines the light model says while the person's turn is still open (an invitation, the presence check) show in the chat
 * as they begin, as the agent's bubble for the turn, and that bubble becomes the message that ends it: the turn closed at
 * the "not yet" limit, or the reply handed over. Driven through the whole voice client in the order hq sends things,
 * checked as the playground draws it (`Transcript`: `revealOf` on its entries, `openLinesOf` for the open bubble) and as
 * the conversation panel draws it (`spokenReveal` on the stored message, `openLinesOf` while none is drawn).
 */
import { describe, expect, it } from 'vitest'
import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V } from '@agenthix/core'
import { revealOf } from '../../../shared/providers/VoiceCallProvider'
import { REVEAL } from '../../../shared/components/reveal/pace'
import { openLinesOf, replyTextOf, revealedText, spokenReveal } from '../reveal'
import { lightRig, speech, type LightRig } from './lightRig'
import { C } from './sessionRig'

const INVITE = '…move the meeting to?'
const PRESENCE = 'Still there, on the meeting?'
const CLOSING = "I'm here whenever you're ready."
const PLAY_MS = 1_000

/** What the chat shows for the turn, in order: the open bubble, or the turn's own bubble once it is drawn. */
type Drawn = { open: ReturnType<typeof openLinesOf>; playground: string | null; panel: string | null }

function draw(r: LightRig, turnId: string | null, stored: string | null): Drawn {
  const snap = r.session.snapshot()
  const drawnId = stored !== null ? turnId : null
  const open = openLinesOf(snap.heading, id => id === drawnId, snap.partial)
  if (stored === null || !turnId) return { open, playground: null, panel: null }
  const p = revealOf(snap, turnId, stored)
  const shown = replyTextOf(snap, turnId, stored)
  const at = spokenReveal(snap.reveal, turnId, shown, REVEAL.leadMs / 1000, snap.heading)
  return { open, playground: revealedText(p.text, p.limit), panel: at ? shown.slice(0, Math.floor(at.target)) : shown }
}

async function trailOff(r: LightRig) {
  await r.start()
  await r.hear(speech(5))
  await r.silence(1_500)
  r.answer({ seq: r.listens().at(-1)!.seq, action: 'invite', say: INVITE, lineId: 'L1', nextCheckSecs: 3 })
  r.line('L1', INVITE)
  await r.advance(100)
  expect(r.linesStarted()).toEqual([INVITE])
}

describe('lines said while the turn is open', () => {
  it('invite, presence check, the limit\'s close: one bubble from the first line, which becomes the closed turn\'s message', async () => {
    const r = lightRig({ playMs: PLAY_MS })
    await trailOff(r)
    const said = r.session.snapshot().partial
    expect(said.trim()).not.toBe('')

    // The invitation shows as it starts, in a bubble of its own after the words said before it.
    let d = draw(r, null, null)
    expect(d.open).toEqual({ lines: INVITE, before: said.trim().split(/\s+/).join(' '), after: '' })

    // Quiet: the next check asks the presence check, which joins the same bubble.
    await r.silence(4_000)
    const check = r.listens().at(-1)!
    expect(check.moment).toBe('quiet')
    r.answer({ seq: check.seq, action: 'invite', say: PRESENCE, lineId: 'L2', nextCheckSecs: 30 })
    r.line('L2', PRESENCE)
    await r.advance(100)
    d = draw(r, null, null)
    expect(d.open?.lines).toBe(`${INVITE} ${PRESENCE}`)

    // The limit: hq records the closed turn (RUNNING, its messages, COMPLETED), then answers, then the closing line plays.
    const stored = `${INVITE} ${PRESENCE} ${CLOSING}`
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't9', state: 'RUNNING' })
    await r.advance(20)
    // Its message is not on screen yet: the bubble stays.
    expect(draw(r, 't9', null).open?.lines).toBe(`${INVITE} ${PRESENCE}`)
    // Its message is: that is the bubble now, with the lines heard and not the closing line, which has not begun.
    d = draw(r, 't9', stored)
    expect(d.open).toBeNull()
    expect(d.playground).toBe(`${INVITE} ${PRESENCE}`)
    expect(d.panel).toBe(`${INVITE} ${PRESENCE}`)
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't9', state: 'COMPLETED' })
    await r.advance(20)
    expect(draw(r, 't9', stored)).toEqual({ open: null, playground: `${INVITE} ${PRESENCE}`, panel: `${INVITE} ${PRESENCE}` })
    r.answer({ seq: r.listens().at(-1)!.seq, action: 'close_turn', say: CLOSING, lineId: 'L3', turn: 'closed', turnId: 't9' })
    await r.advance(20)
    expect(draw(r, 't9', stored).playground).toBe(`${INVITE} ${PRESENCE}`)
    r.line('L3', CLOSING)
    await r.advance(PLAY_MS + 100)
    expect(r.linesStarted()).toEqual([INVITE, PRESENCE, CLOSING])
    expect(draw(r, 't9', stored)).toEqual({ open: null, playground: stored, panel: stored })

    // The next reply starts with none of them.
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't10', state: 'RUNNING' })
    await r.advance(20)
    expect(r.session.snapshot().heading ?? null).toBeNull()
    expect(draw(r, 't10', '').playground).toBe('')
  })

  it('invite, you speak again, hand-over, reply: your new words show under the bubble, which heads the reply', async () => {
    const r = lightRig({ playMs: PLAY_MS })
    await trailOff(r)
    const before = r.session.snapshot().partial.trim().split(/\s+/)

    // You go on: your new words show after the bubble, not above it.
    await r.hear(speech(3, 10))
    await r.advance(300)
    const now = r.session.snapshot().partial.trim().split(/\s+/)
    expect(now.length).toBeGreaterThan(before.length)
    expect(draw(r, null, null).open).toEqual({ lines: INVITE, before: before.join(' '), after: now.slice(before.length).join(' ') })

    // Handed over with a hold: it joins the bubble.
    await r.silence(1_500)
    const HOLD = 'Got it.'
    r.answer({ seq: r.listens().at(-1)!.seq, action: 'hand_over', say: HOLD, lineId: 'L2', turn: 'handedOver', nextCheckSecs: 2 })
    r.line('L2', HOLD)
    await r.advance(100)
    expect(draw(r, null, null).open?.lines).toBe(`${INVITE} ${HOLD}`)

    // The reply's turn runs: its bubble is the same lines, and the open bubble is gone.
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'RUNNING' })
    await r.advance(20)
    expect(draw(r, 't1', '')).toEqual({ open: null, playground: `${INVITE} ${HOLD}`, panel: `${INVITE} ${HOLD}` })

    // The reply: written, stored after the lines, then heard. Its words follow its voice after the lines.
    const REPLY = 'Tuesday works for everyone.'
    const STORED = `${INVITE} ${HOLD}\n\n${REPLY}`
    r.receive(V.heardPrefix, { conversationId: C, turnId: 't1', text: `${INVITE} ${HOLD}` })
    r.reply('t1', REPLY)
    r.receive(CONVERSATION_SOCKET.turn, { conversationId: C, turnId: 't1', state: 'COMPLETED' })
    await r.advance(20)
    expect(draw(r, 't1', STORED).playground).toBe(`${INVITE} ${HOLD}`)
    let last = 0
    let grew = false
    for (let i = 0; i < 30; i++) {
      await r.advance(100)
      const d = draw(r, 't1', STORED)
      expect(d.open).toBeNull()
      expect(d.playground!.startsWith(`${INVITE} ${HOLD}`)).toBe(true)
      expect(d.playground!.length).toBeGreaterThanOrEqual(last)
      if (d.playground!.length > `${INVITE} ${HOLD}`.length) grew = true
      last = d.playground!.length
    }
    expect(grew).toBe(true)
  })

  it('with Adaptive voice off, nothing heads anything and no bubble of lines shows', async () => {
    const r = lightRig({ voiceListener: false, adaptiveVoice: false })
    await r.start()
    await r.hear(speech(4))
    await r.silence(1_500)
    expect(r.session.snapshot().heading ?? null).toBeNull()
    expect(draw(r, null, null).open).toBeNull()
  })
})
