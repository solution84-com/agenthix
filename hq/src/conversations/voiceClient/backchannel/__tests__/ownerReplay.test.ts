/**
 * The owner's three tellings of 18 Nov replayed through the backchannel (spec §The backchannel): with lane 21's first
 * values the long story got the one hum the log shows and the others none; with the values the owner chose it hums
 * every few sentences in a telling, and never after "Did I forget anything?". Each hum the replay makes plays for 0.6 s.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceSettings } from '../../settings'
import { silence } from '../../orchestration/__tests__/setup'
import { answer, finished, FIRST_VALUES, ON, setup, verdict } from './backchannelRig'
import { OWNER_TELLINGS, TELLINGS, type Timed } from './ownerTellings'

const HUM_MS = 600

function replay(settings: VoiceSettings) {
  const s = setup(settings)
  const queue: Timed[] = [...OWNER_TELLINGS]
  let heard = 0
  const end = queue.at(-1)![0] + 1_000
  for (let t = 0; t <= end; t += 50) {
    while (queue.length && queue[0]![0] <= t) {
      const [at, body] = queue.shift()!
      s.at(at, body)
    }
    s.at(t, { kind: 'clock.tick' })
    const hums = s.hums()
    for (; heard < hums.length; heard++) {
      // The speaker plays it: an agent sound, heard for its length.
      const h = hums[heard]!
      s.at(t, { kind: 'phrase.at', text: 'Mm-hm.', playing: true, backchannel: true })
      queue.push([h.t + HUM_MS, { kind: 'phrase.at', text: 'Mm-hm.', playing: false, backchannel: true }])
      queue.sort((a, b) => a[0] - b[0])
    }
  }
  const within = ([from, to]: readonly [number, number]) => s.hums().filter(h => h.t >= from && h.t < to)
  return {
    hiking: within(TELLINGS.hiking), justSoYouKnow: within(TELLINGS.justSoYouKnow), packing: within(TELLINGS.packing),
    misses: s.misses(),
  }
}

describe("the owner's tellings @SC-2226", () => {
  it('with the first values: one hum in the 38 s story, as the log has it, none in the others', () => {
    const r = replay(FIRST_VALUES)
    expect(r.hiking.map(h => h.t)).toEqual([19_200])
    expect(r.justSoYouKnow).toEqual([])
    expect(r.packing).toEqual([])
  })

  it('with the values the owner chose: a hum every few sentences in a telling, none after "Did I forget anything?"', () => {
    const r = replay(ON)
    // Three in the 38 s story, about every 8 to 10 s, each 0.5 to 0.6 s into a pause the sound model called not finished.
    expect(r.hiking.map(h => h.t)).toEqual([10_800, 19_100, 28_500])
    // One in the two-sentence telling, at its pause mid-way.
    expect(r.justSoYouKnow.map(h => h.t)).toEqual([86_100])
    // Short items, 3 s of speech before the turn ended: none.
    expect(r.packing).toEqual([])
    expect(r.misses.filter(m => m.t > 138_700)).toEqual([])
  })

  it('none in a one-line question, even kept open', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, { kind: 'stt.utterance', text: "What's the weather in Melbourne?" })
    s.at(2_200, silence(true))
    s.tickTo(2_650)
    s.at(2_700, verdict('READY'))
    s.all(3_000, finished(1, "What's the weather in Melbourne?"))
    s.all(4_200, answer(1, 'notYet'))
    s.tickTo(5_000)
    expect(s.hums()).toEqual([])
  })
})
