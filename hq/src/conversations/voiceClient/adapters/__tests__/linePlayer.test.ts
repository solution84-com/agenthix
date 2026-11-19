/**
 * The light model's lines (adaptive voice listening, spec §How its words are played): each plays once its answer allows
 * it and its audio is here, in either order, to its end and never cut; one at a time; a hum or acknowledgement under a
 * reply's level; hq told of each played to its end.
 */
import { describe, expect, it } from 'vitest'
import { createLinePlayer, LINE_STALL_MS } from '../linePlayer'
import { fakePlayback } from '../../__tests__/sessionRig'

function setup() {
  const made: Array<ReturnType<typeof fakePlayback>> = []
  const played: string[] = []
  const skipped: string[] = []
  /** The first sample of each line's audio as enqueued: its level. */
  const samples: number[] = []
  const may = { now: true }
  const wait = { now: false }
  const clock = { t: 0 }
  const lines = createLinePlayer({
    now: () => clock.t,
    createPlayback: () => {
      const pb = fakePlayback()
      const enqueue = pb.playback.enqueue
      pb.playback.enqueue = (i, pcm) => { samples.push(new Int16Array(pcm)[0]!); enqueue(i, pcm) }
      made.push(pb)
      return pb.playback
    },
    played: lineId => played.push(lineId),
    skipped: lineId => skipped.push(lineId),
    quietGainDb: () => -6,
    mayStart: () => (may.now ? null : 'a reply was playing'),
    waits: () => wait.now,
  })
  const audio = (value = 1000) => new Int16Array([value, value]).buffer
  const line = (lineId: string, text: string, value?: number) => ({ conversationId: 'c1', lineId, text, audio: audio(value) })
  /** The line playing now reaches its end. */
  const ends = () => { made.at(-1)!.state.idle = true }
  /** A part of a line sent as it is made. */
  const part = (lineId: string, index: number, end = false, value?: number) =>
    ({ ...line(lineId, 'Let me check the forecast.', value), index, ...(end && { end: true as const }) })
  return { lines, made, played, skipped, line, part, ends, samples, may, wait, clock }
}

describe('the line player @SC-2229', () => {
  it('plays a line once allowed and here, whichever comes first, and tells hq when it played to its end', () => {
    const s = setup()
    s.lines.add(s.line('L1', 'Let me check.'))
    expect(s.lines.busy()).toBe(false)
    s.lines.allow('L1', false)
    expect(s.lines.busy()).toBe(true)
    expect(s.lines.tick()).toMatchObject({ text: 'Let me check.', playing: true, lineId: 'L1' })
    s.ends()
    expect(s.lines.tick()).toMatchObject({ text: 'Let me check.', playing: false, lineId: 'L1' })
    expect(s.played).toEqual(['L1'])
    s.lines.allow('L2', true)
    s.lines.add(s.line('L2', 'Mm-hm.'))
    expect(s.lines.busy()).toBe(true)
  })

  it('never plays a line it was not allowed to', () => {
    const s = setup()
    s.lines.add(s.line('L1', 'Go on.'))
    expect(s.lines.tick()).toBeNull()
    expect(s.made).toHaveLength(0)
  })

  it('plays one at a time, in order, each to its end @SC-2208', () => {
    const s = setup()
    s.lines.allow('L1', false)
    s.lines.allow('L2', true)
    s.lines.add(s.line('L1', 'Okay.'))
    s.lines.add(s.line('L2', 'Right.'))
    expect(s.made).toHaveLength(1)
    s.ends()
    s.lines.tick()
    expect(s.played).toEqual(['L1'])
    expect(s.made).toHaveLength(2)
    expect(s.lines.tick()).toMatchObject({ lineId: 'L2', playing: true })
  })

  it('plays a hum or acknowledgement under a reply\'s level, other lines at it @SC-2199', () => {
    const s = setup()
    s.lines.allow('L1', true)
    s.lines.add(s.line('L1', 'Mm-hm.', 10_000))
    s.ends(); s.lines.tick()
    s.lines.allow('L2', false)
    s.lines.add(s.line('L2', 'Let me look.', 10_000))
    expect(s.samples).toEqual([5012, 10_000])
  })

  it('a line that may not start now (a reply is playing) is dropped, not delayed @SC-2210', () => {
    const s = setup()
    s.may.now = false
    s.lines.allow('L1', true)
    s.lines.add(s.line('L1', 'Mm.'))
    s.may.now = true
    s.lines.tick()
    expect(s.lines.busy()).toBe(false)
    expect(s.made).toHaveLength(0)
  })

  it('tells hq of a line it dropped, never as played @SC-2210 @SC-2216', () => {
    const s = setup()
    s.may.now = false
    s.lines.allow('L1', true)
    s.lines.add(s.line('L1', 'Mm.'))
    expect(s.skipped).toEqual(['L1'])
    expect(s.played).toEqual([])
  })

  it('keeps only a few lines waiting for their answer', () => {
    const s = setup()
    for (let i = 0; i < 20; i++) s.lines.add(s.line(`X${i}`, 'Mm.'))
    s.lines.allow('X0', true)
    expect(s.lines.busy()).toBe(false)
    s.lines.allow('X19', true)
    expect(s.lines.busy()).toBe(true)
  })

  it('a line in parts starts with its first part, takes the rest into the same playback, and ends only after its last @SC-2208', () => {
    const s = setup()
    s.lines.allow('L1', true)
    s.lines.add(s.part('L1', 0, false, 10_000))
    expect(s.made).toHaveLength(1)
    expect(s.made[0]!.state.enqueued).toHaveLength(1)
    expect(s.made[0]!.state.finished).toBe(false)
    s.lines.add(s.part('L1', 1, false, 10_000))
    s.lines.add(s.part('L1', 1, false, 10_000))
    expect(s.made[0]!.state.enqueued).toHaveLength(2)
    // Every part under a reply's level, as a hum.
    expect(s.samples).toEqual([5012, 5012])
    s.lines.add({ ...s.part('L1', 2, true), audio: new ArrayBuffer(0) })
    expect(s.made[0]!.state.enqueued).toHaveLength(2)
    expect(s.made[0]!.state.finished).toBe(true)
    s.ends()
    expect(s.lines.tick()).toMatchObject({ lineId: 'L1', playing: false })
    expect(s.played).toEqual(['L1'])
    expect(s.made).toHaveLength(1)
  })

  it('parts that come before the answer wait with the line, and play in order once it is allowed', () => {
    const s = setup()
    s.lines.add(s.part('L1', 0))
    s.lines.add(s.part('L1', 1, true))
    expect(s.made).toHaveLength(0)
    s.lines.allow('L1', false)
    expect(s.made[0]!.state.enqueued).toHaveLength(2)
    expect(s.made[0]!.state.finished).toBe(true)
  })

  it('a line in parts waiting behind another takes its parts with it', () => {
    const s = setup()
    s.lines.allow('L1', false)
    s.lines.add(s.line('L1', 'Okay.'))
    s.lines.allow('L2', false)
    s.lines.add(s.part('L2', 0))
    s.lines.add(s.part('L2', 1, true))
    s.ends(); s.lines.tick()
    expect(s.made).toHaveLength(2)
    expect(s.made[1]!.state.enqueued).toHaveLength(2)
    expect(s.made[1]!.state.finished).toBe(true)
  })

  it('a line whose parts stop coming ends where it got to, so a reply never waits on it for ever', () => {
    const s = setup()
    s.lines.allow('L1', false)
    s.lines.add(s.part('L1', 0))
    s.clock.t = LINE_STALL_MS - 1
    s.lines.tick()
    expect(s.made[0]!.state.finished).toBe(false)
    s.clock.t = LINE_STALL_MS
    s.lines.tick()
    expect(s.made[0]!.state.finished).toBe(true)
  })

  it('stops with voice, and says nothing of a line it cut', () => {
    const s = setup()
    s.lines.allow('L1', false)
    s.lines.add(s.line('L1', 'Let me check.'))
    expect(s.lines.clear()).toBe('Let me check.')
    expect(s.lines.busy()).toBe(false)
    expect(s.played).toEqual([])
  })
})

describe('one decision plays its line exactly once (the double hum) @SC-2229', () => {
  it('an answer allowing the line twice plays it once', () => {
    const s = setup()
    s.lines.add(s.line('L1', 'Mm-hm.'))
    s.lines.allow('L1', true)
    s.ends()
    s.lines.tick()
    s.lines.allow('L1', true)
    expect(s.lines.busy()).toBe(false)
    expect(s.made).toHaveLength(1)
  })

  it('its audio sent again after it played is not played again, however it is allowed', () => {
    const s = setup()
    s.lines.allow('L1', true)
    s.lines.add(s.line('L1', 'Mm-hm.'))
    s.ends()
    s.lines.tick()
    s.lines.add(s.line('L1', 'Mm-hm.'))
    s.lines.allow('L1', true)
    expect(s.lines.busy()).toBe(false)
    expect(s.made).toHaveLength(1)
    expect(s.played).toEqual(['L1'])
  })

  it('a line skipped is never played later', () => {
    const s = setup()
    s.may.now = false
    s.lines.add(s.line('L1', 'Right.'))
    s.lines.allow('L1', true)
    s.may.now = true
    s.lines.allow('L1', true)
    expect(s.made).toHaveLength(0)
    expect(s.skipped).toEqual(['L1'])
  })
})

describe('while a hum plays, a line waits for it to end @SC-2229', () => {
  it('starts on the tick after the hum ends, never cut and never skipped', () => {
    const s = setup()
    s.wait.now = true
    s.lines.add(s.line('L1', 'Let me check.'))
    s.lines.allow('L1', false)
    expect(s.lines.busy()).toBe(false)
    expect(s.lines.tick()).toBeNull()
    s.wait.now = false
    expect(s.lines.tick()).toMatchObject({ lineId: 'L1', playing: true })
    expect(s.skipped).toEqual([])
  })
})

describe('a line the listening runtime dropped as its answer came (the person spoke again) @SC-2229', () => {
  it('is never heard, whether its audio came before the drop or comes after, and hq hears it was skipped once', () => {
    const s = setup()
    s.lines.add(s.line('L1', 'Go on, I am with you.'))
    s.lines.drop('L1')
    s.lines.drop('L2')
    s.lines.add(s.line('L2', 'Mm, got it.'))
    s.lines.allow('L2', false)
    s.lines.tick()
    expect(s.made).toHaveLength(0)
    expect(s.skipped).toEqual(['L1', 'L2'])
    s.lines.drop('L1')
    expect(s.skipped).toEqual(['L1', 'L2'])
  })
})
