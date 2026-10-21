import { describe, expect, it } from 'vitest'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/voice'
import { heldUpdate, RaisedHand } from '../hand'

function hand() {
  const sent: { event: string; payload: unknown }[] = []
  return { sent, hand: new RaisedHand('conv-1', (event, payload) => { sent.push({ event, payload }) }) }
}

describe("an agent's raised hand", () => {
  it('tells the holder once, and again only when it becomes critical', () => {
    const { hand: h, sent } = hand()
    h.raise({ updateId: 'card-1', critical: false })
    h.raise({ updateId: 'card-1', critical: false })
    h.raise({ updateId: 'card-1', critical: true })
    expect(sent).toEqual([
      { event: V.update, payload: { conversationId: 'conv-1', updateId: 'card-1', critical: false } },
      { event: V.update, payload: { conversationId: 'conv-1', updateId: 'card-1', critical: true } },
    ])
  })

  it('holds the cards until the hand raised now is invited, then until its turn is taken', () => {
    const { hand: h, sent } = hand()
    expect(h.holds()).toBe(true)
    h.raise({ updateId: 'card-1', critical: false })
    expect(h.invite('card-0')).toBe(false)
    expect(h.holds()).toBe(true)
    expect(h.invite('card-1')).toBe(true)
    expect(h.holds()).toBe(false)
    h.raise({ updateId: 'card-1', critical: false })
    h.tell()
    expect(sent).toHaveLength(1)
    h.taken()
    expect(h.holds()).toBe(true)
    h.raise({ updateId: 'card-2', critical: false })
    expect(sent).toHaveLength(2)
  })

  it('an invitation with no hand raised does nothing', () => {
    const { hand: h } = hand()
    expect(h.invite('card-1')).toBe(false)
    expect(h.holds()).toBe(true)
  })
})

describe('the update the waiting cards make', () => {
  it('is the first card, critical only for a request for the okay', () => {
    expect(heldUpdate([])).toBeNull()
    expect(heldUpdate([{ id: 'a', kind: 'RESULT' }, { id: 'b', kind: 'RESULT' }])).toEqual({ updateId: 'a', critical: false })
    expect(heldUpdate([{ id: 'a', kind: 'RESULT' }, { id: 'b', kind: 'APPROVAL_REQUEST' }])).toEqual({ updateId: 'a', critical: true })
  })
})

describe('a raised hand nobody answers', () => {
  function timed() {
    const timers: { ms: number; fn: () => void; cancelled: boolean }[] = []
    let expired = 0
    const h = new RaisedHand('conv-1', () => {}, {
      expired: () => { expired++ },
      timer: { after: (ms, fn) => { const t = { ms, fn, cancelled: false }; timers.push(t); return () => { t.cancelled = true } } },
    })
    const fire = () => timers.filter(t => !t.cancelled).forEach(t => t.fn())
    return { h, timers, fire, expired: () => expired }
  }

  it('is let go after the limit: the cards no longer wait, and its turn is taken as text', () => {
    const { h, timers, fire, expired } = timed()
    h.raise({ updateId: 'card-1', critical: false })
    expect(timers.map(t => t.ms)).toEqual([60_000])
    fire()
    expect(expired()).toBe(1)
    expect(h.holds()).toBe(false)
    expect(h.asText()).toBe(true)
    expect(h.invite('card-1')).toBe(false)
    h.taken()
    expect(h.asText()).toBe(false)
    expect(h.holds()).toBe(true)
  })

  it('keeps no limit once invited, nor once voice ends', () => {
    const invited = timed()
    invited.h.raise({ updateId: 'card-1', critical: false })
    invited.h.invite('card-1')
    invited.fire()
    expect(invited.expired()).toBe(0)
    expect(invited.h.asText()).toBe(false)
    const closed = timed()
    closed.h.raise({ updateId: 'card-1', critical: false })
    closed.h.close()
    closed.fire()
    expect(closed.expired()).toBe(0)
  })

  it('starts its limit once per update, not again when it becomes critical', () => {
    const { h, timers } = timed()
    h.raise({ updateId: 'card-1', critical: false })
    h.raise({ updateId: 'card-1', critical: true })
    expect(timers.filter(t => !t.cancelled)).toHaveLength(1)
  })
})
