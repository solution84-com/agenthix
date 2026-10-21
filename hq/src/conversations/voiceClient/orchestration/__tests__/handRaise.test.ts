import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { VOICE_SETTINGS } from '../../settings'
import { floor } from '../floor'
import { handRaise } from '../handRaise'
import { playing, rig, silence, stopped } from './setup'

const { openingMs } = VOICE_SETTINGS.handRaise
const update = (updateId: string, critical = false) => ({ kind: 'reply.update', updateId, critical }) as const
const person = (text: string): VoiceEventBody => ({ kind: 'stt.person', text, committed: false, order: 1, timed: [] })

function setup() {
  const r = rig([floor, handRaise], ['orchestration.handRaise', 'orchestration.playback'])
  const said = () => r.out.map(e => e.kind === 'orchestration.handRaise' ? `${e.state}:${e.updateId}`
    : e.kind === 'orchestration.playback' ? e.action : e.kind)
  return { ...r, said }
}

describe('the hand-raise', () => {
  it('raises the hand when hq marks an update, and waits for an opening before inviting it', () => {
    const h = setup()
    h.at(0, update('u1'))
    expect(h.said()).toEqual(['raised:u1'])
    h.tickTo(openingMs - 50)
    expect(h.said()).toEqual(['raised:u1'])
    h.tickTo(openingMs + 50)
    expect(h.said()).toEqual(['raised:u1', 'invited:u1'])
  })

  it('starts the opening again whenever the person takes the floor', () => {
    const h = setup()
    h.at(0, update('u1'))
    h.tickTo(1_000)
    h.at(1_000, silence(false))
    h.tickTo(4_000)
    h.at(4_000, silence(true))
    h.tickTo(4_000 + 3_000)
    expect(h.said()).toEqual(['raised:u1'])
    // The pause came to nothing: the floor is open again, and the opening counts from then.
    h.tickTo(4_000 + VOICE_SETTINGS.pause.capMs + 1_100 + openingMs + 100)
    expect(h.said()).toEqual(['raised:u1', 'invited:u1'])
  })

  it('never takes the floor from a reply the person is waiting for', () => {
    const h = setup()
    h.at(0, { kind: 'orchestration.send', text: 'hi', append: false })
    h.at(100, update('u1'))
    h.tickTo(5_000)
    h.at(5_000, playing('r1'))
    h.tickTo(8_000)
    expect(h.said()).toEqual(['raised:u1'])
    h.at(8_000, stopped('r1', true))
    h.tickTo(8_000 + openingMs + 50)
    expect(h.said()).toEqual(['raised:u1', 'invited:u1'])
  })

  it('is invited by a tap on the badge, or by the person’s words', () => {
    const tapped = setup()
    tapped.at(0, update('u1'))
    tapped.at(300, { kind: 'person.tap', target: 'hand-raise' })
    expect(tapped.said()).toEqual(['raised:u1', 'invited:u1'])

    for (const words of ['Go ahead.', 'what is it', 'Yes?']) {
      const asked = setup()
      asked.at(0, update('u1'))
      asked.at(300, person(words))
      expect(asked.said()).toEqual(['raised:u1', 'invited:u1'])
    }
    const other = setup()
    other.at(0, update('u1'))
    other.at(300, person('yes I think so'))
    expect(other.said()).toEqual(['raised:u1'])
  })

  it('raises the next update once the first has had its turn', () => {
    const h = setup()
    h.at(0, update('u1'))
    h.at(10, update('u2'))
    h.at(10, update('u1'))
    h.at(300, { kind: 'person.tap', target: 'hand-raise' })
    expect(h.said()).toEqual(['raised:u1', 'invited:u1', 'raised:u2'])
  })

  it('speaks a critical update at once when nobody is speaking', () => {
    const h = setup()
    h.at(0, update('u1', true))
    expect(h.said()).toEqual(['raised:u1', 'invited:u1'])
  })

  it('speaks a critical update after the current sentence of a reply', () => {
    const h = setup()
    h.at(0, { kind: 'orchestration.send', text: 'hi', append: false })
    h.at(100, playing('r1', 0))
    h.at(500, update('u1', true))
    h.at(800, playing('r1', 0))
    expect(h.said()).toEqual(['raised:u1'])
    h.at(2_000, playing('r1', 1))
    expect(h.said()).toEqual(['raised:u1', 'stop', 'invited:u1'])
  })

  it('clears a hand nobody answers within the limit, as hq lets it go, and raises the next', () => {
    const h = setup()
    h.at(0, { kind: 'orchestration.send', text: 'hi', append: false })
    h.at(100, update('u1'))
    h.at(200, update('u2'))
    h.tickTo(100 + VOICE_SETTINGS.handRaise.unansweredMs - 50)
    expect(h.said()).toEqual(['raised:u1'])
    h.tickTo(100 + VOICE_SETTINGS.handRaise.unansweredMs + 50)
    expect(h.said()).toEqual(['raised:u1', 'cleared:u1', 'raised:u2'])
  })
})
