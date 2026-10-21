import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import type { FloorState } from '../../events'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import { after, STRAY_WINDOW_MS, utterance } from '../utterance'

function setup() {
  const clock = fakeClock()
  const runtime = createVoiceRuntime({ components: [utterance], adapters: [], settings: VOICE_SETTINGS, clock, tickMs: 50 })
  const shown: string[] = []
  const sent: string[] = []
  runtime.subscribe(['stt.utterance'], e => shown.push(e.text))
  runtime.subscribe(['orchestration.send'], e => sent.push(e.text))
  runtime.start()
  /** Words heard, with silence detection having heard the person unless `voiced` is false. */
  const person = (text: string, committed: boolean, order: number | null = null, voiced = true) => {
    if (voiced) runtime.publish({ kind: 'acoustic.silence', silent: false, t: clock.now() })
    runtime.publish({ kind: 'stt.person', text, committed, order, timed: [], t: clock.now() })
  }
  // The response scheduler sends what is shown; here the test does.
  const send = () => runtime.publish({ kind: 'orchestration.send', text: shown.at(-1) ?? '', append: false, t: clock.now() })
  const floor = (state: FloorState) => runtime.publish({ kind: 'orchestration.floor', state, t: clock.now() })
  return { clock, runtime, shown, sent, person, send, floor }
}

describe('the words of a message @SC-995', () => {
  it('finds what follows words already said, ignoring case and punctuation', () => {
    expect(after('Look through the files in MySpace and tell me.', 'look through the files in')).toBe('MySpace and tell me.')
    expect(after('Look through the files.', 'Look through the files.')).toBe('')
    expect(after('Something else entirely.', 'Look through')).toBeNull()
  })
})

describe('what the person is saying now @SC-995', () => {
  it('neither shows nor sends words heard with no voice detected, as the agent\'s last words heard back', () => {
    const c = setup()
    c.person('Synthesis.', true, 3, false)
    expect(c.shown.at(-1)).toBe('')
    c.runtime.publish({ kind: 'stt.flush', t: c.clock.now() })
    expect(c.sent).toEqual([])
    c.person('What time is it?', true, 4)
    expect(c.shown.at(-1)).toBe('What time is it?')
  })

  it('shows the words as they come and never sends on the provider’s end of turn', () => {
    const c = setup()
    c.person('Book the meeting', false, 0)
    c.person('Book the meeting room.', true, 0)
    expect(c.shown).toEqual(['Book the meeting', 'Book the meeting room.'])
    c.clock.advance(10_000)
    expect(c.sent).toEqual([])
  })

  it('joins turns the provider ended with a pause in the middle', () => {
    const c = setup()
    c.person('Look through the files in', true, 4)
    c.person('my space and', false, 5)
    expect(c.shown.at(-1)).toBe('Look through the files in my space and')
    c.person('my space and tell me.', true, 5)
    expect(c.shown.at(-1)).toBe('Look through the files in my space and tell me.')
  })

  it('does not join the words of a message already sent to the next one, however long after', () => {
    const c = setup()
    c.person('The quick brown fox jumps over the lazy', false, 0)
    c.send()
    c.person('The quick brown fox jumps over the lazy', true, 0)
    c.clock.advance(40_000)
    c.person('The quick brown fox jumps over the', false, 1)
    expect(c.shown.at(-1)).toBe('The quick brown fox jumps over the')
  })

  it('clears when a message is sent, and does not show its words again when they arrive late', () => {
    const c = setup()
    c.person('book the room', false, 0)
    c.send()
    expect(c.shown.at(-1)).toBe('')
    c.person('Book the room.', true, 0)
    expect(c.shown.at(-1)).toBe('')
    c.person('And order lunch.', true, 1)
    expect(c.shown.at(-1)).toBe('And order lunch.')
  })

  it('shows only what is new when the next words carry on from the message', () => {
    const c = setup()
    c.person('Book the room', false, 0)
    c.send()
    c.person('Book the room for Tuesday', false, 0)
    expect(c.shown.at(-1)).toBe('for Tuesday')
  })

  it('takes one word just after a message, while a reply is awaited, for a stray', () => {
    const c = setup()
    c.person('Book the room.', true, 0)
    c.send()
    c.floor('agent-thinking')
    c.person('Sentenced.', true, 1)
    expect(c.shown.at(-1)).toBe('')
    c.clock.advance(STRAY_WINDOW_MS)
    c.person('Yes.', true, 2)
    expect(c.shown.at(-1)).toBe('Sentenced. Yes.')
  })

  it('sends what is shown when voice ends by the person’s hand, and nothing when nothing is', () => {
    const c = setup()
    c.runtime.publish({ kind: 'stt.flush', t: c.clock.now() })
    expect(c.sent).toEqual([])
    c.person('Look through the files in', true, 0)
    c.runtime.publish({ kind: 'stt.flush', t: c.clock.now() })
    expect(c.sent).toEqual(['Look through the files in'])
  })

  it('lets go of what was being said when the person mutes', () => {
    const c = setup()
    c.person('Look through the files in', false, 0)
    c.runtime.publish({ kind: 'stt.muted', muted: true, t: c.clock.now() })
    expect(c.shown.at(-1)).toBe('')
    c.runtime.publish({ kind: 'stt.flush', t: c.clock.now() })
    expect(c.sent).toEqual([])
  })
})
