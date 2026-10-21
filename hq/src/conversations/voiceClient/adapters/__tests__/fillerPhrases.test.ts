import { describe, expect, it, vi } from 'vitest'
import { fakeClock } from '../../clock'
import type { VoiceEvent, VoiceEventBody } from '../../events'
import type { Playback } from '../../playback'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import { IDLE, type VoiceSnapshot } from '../../voiceSnapshot'
import { createSpeaker } from '../speaker'

const C = 'c1'
const H = VOICE_SETTINGS.filler
const at = (step: number) => H.steps[step]!.afterMs

/** A playback that plays until `end()` is called. */
function fakePlayback(name: string, log: string[]) {
  let done = false
  let finished = false
  const playback: Playback & { end: () => void } = {
    enqueue: (i) => { log.push(`${name} enqueue ${i}`) },
    finish: () => { finished = true },
    stop: () => { log.push(`${name} stop`); return -1 },
    position: () => ({ index: 0, elapsed: 0, ended: false }),
    idle: () => finished && done,
    close: () => { log.push(`${name} close`) },
    heardAudio: () => new Int16Array(512),
    end: () => { done = true },
  }
  return playback
}

const CLIPS = [
  { text: 'Mm.', tier: 0 }, { text: 'Okay.', tier: 0 },
  { text: 'One sec.', tier: 1 },
  { text: 'Bear with me.', tier: 2 },
  { text: 'Sorry, this is taking longer.', tier: 3 }, { text: 'Still on it.', tier: 3 },
]

function setup(opts: { random?: number; clips?: typeof CLIPS } = {}) {
  let snap: VoiceSnapshot = { ...IDLE, conversationId: C, phase: 'listening' }
  const log: string[] = []
  const made: Array<ReturnType<typeof fakePlayback>> = []
  const clock = fakeClock()
  let runtime: ReturnType<typeof createVoiceRuntime> | null = null
  const speaker = createSpeaker({
    snapshot: () => snap, set: (p) => { snap = { ...snap, ...p } },
    createPlayback: () => { const p = fakePlayback(`p${made.length}`, log); made.push(p); return p },
    hq: { interrupt: vi.fn() } as never, runtime: () => runtime, random: () => opts.random ?? 0.9,
  })
  runtime = createVoiceRuntime({ components: [], adapters: [speaker.adapter], settings: VOICE_SETTINGS, clock })
  runtime.start()
  const rt = runtime
  const out: VoiceEvent[] = []
  rt.subscribe('*', e => { if (e.kind !== 'clock.tick') out.push(e) })
  for (const c of opts.clips ?? CLIPS) speaker.phrase({ conversationId: C, ...c, audio: new Uint8Array(8) })
  const publish = (e: VoiceEventBody) => rt.publish({ ...e, t: clock.now() })
  const said = () => out.filter(e => e.kind === 'phrase.at' && e.playing)
    .map(e => (e as { text: string }).text).filter((t, i, all) => t !== all[i - 1])
  return {
    speaker, log, made, out, publish, said,
    now: () => clock.now(),
    send: (trailedOff = false) => {
      snap = { ...snap, phase: 'thinking' }
      publish({ kind: 'orchestration.send', text: 'hello', append: false, ...(trailedOff && { trailedOff }) })
    },
    /** To `ms` after the start, ticking. */
    to: (ms: number) => { clock.advance(ms - clock.now()); publish({ kind: 'clock.tick' }) },
    /** The phrase playing ends, heard on the next tick. */
    finish: () => { made.at(-1)!.end(); clock.advance(20); publish({ kind: 'clock.tick' }) },
    sentence: (turnId: string) => {
      speaker.sentence({ conversationId: C, turnId, index: 0, text: 'Hi.', textStart: 0, textEnd: 3, words: ['Hi'], wordStartSecs: [0], wordEndSecs: [0.3] })
      speaker.audio({ conversationId: C, turnId, index: 0, audio: new ArrayBuffer(4) })
    },
  }
}

describe('the filler phrases', () => {
  it('say a little more the longer the wait, the last repeating, never the same twice in a row', () => {
    const s = setup()
    s.send()
    s.to(at(0)); s.finish()
    s.to(at(1)); s.finish()
    s.to(at(2)); s.finish()
    s.to(at(3)); s.finish()
    s.to(at(3) + H.repeatEveryMs); s.finish()
    expect(s.said()).toEqual(['Okay.', 'One sec.', 'Bear with me.', 'Still on it.', 'Sorry, this is taking longer.'])
  })

  it('say a short one the moment the message goes, and then wait for the next step', () => {
    const s = setup({ random: 0 })
    s.send()
    s.to(20)
    expect(s.said()).toEqual(['Mm.'])
    s.finish()
    s.to(at(1) - 100)
    expect(s.said()).toEqual(['Mm.'])
    s.to(at(1))
    expect(s.said()).toEqual(['Mm.', 'One sec.'])
  })

  it('say nothing but the long wait\'s for a message sent as the person trailed off', () => {
    const s = setup()
    s.send(true)
    s.to(at(2) + 100)
    expect(s.said()).toEqual([])
    s.to(at(3)); s.finish()
    expect(s.said()).toEqual(['Still on it.'])
  })

  it('come less often the longer the wait', () => {
    const gaps = H.steps.slice(1).map((step, i) => step.afterMs - H.steps[i]!.afterMs)
    expect(gaps.every((gap, i) => i === 0 || gap > gaps[i - 1]!)).toBe(true)
    expect(H.repeatEveryMs).toBeGreaterThanOrEqual(gaps.at(-1)!)
  })

  it('say one of the step before at a step with none of its own', () => {
    const s = setup({ clips: [{ text: 'Mm.', tier: 0 }, { text: 'Sure, one moment.', tier: 1 }, { text: 'Okay, on it.', tier: 1 }] })
    s.send()
    s.to(at(0)); s.finish()
    s.to(at(1)); s.finish()
    s.to(at(2)); s.finish()
    expect(s.said()).toEqual(['Mm.', 'Okay, on it.', 'Sure, one moment.'])
  })

  it('say none of the last few again while another can be said', () => {
    const shorts = ['Mm.', 'Okay.', 'Right.', 'Sure.', 'Hmm.', 'Mm-hm.', 'Alright.']
    const s = setup({ random: 0, clips: shorts.map(text => ({ text, tier: 0 })) })
    for (let i = 0; i < 6; i++) {
      s.send(); s.to(s.now() + 20); s.finish()
      s.speaker.turn({ conversationId: C, turnId: `r${i}`, state: 'COMPLETED' } as never)
      s.to(s.now() + H.gapMs + 20)
    }
    const heard = s.said()
    expect(heard).toHaveLength(6)
    for (let i = 0; i < heard.length; i++) expect(heard.slice(Math.max(0, i - H.recent), i)).not.toContain(heard[i])
  })

  it('are heard for the echo check, and are part of no reply', () => {
    const s = setup()
    s.send()
    s.to(at(0))
    expect(s.out.some(e => e.kind === 'playback.frame')).toBe(true)
    expect(s.out.some(e => e.kind === 'playback.at' || e.kind === 'reply.sentence')).toBe(false)
  })

  it('stop when the reply begins: one playing finishes, and the reply waits for it', () => {
    const s = setup()
    s.send()
    s.to(at(0))
    s.sentence('r1')
    expect(s.log).toEqual(['p0 enqueue 0'])
    s.finish()
    expect(s.log).toEqual(['p0 enqueue 0', 'p0 close', 'p1 enqueue 0'])
    s.to(at(3))
    expect(s.said()).toEqual(['Okay.'])
  })

  it('never start a new one closer than the gap after the last ends', () => {
    const s = setup()
    s.send()
    s.to(at(0))
    s.to(at(1) - 100)
    s.finish()
    s.to(at(1) + 100)
    expect(s.said()).toEqual(['Okay.'])
    s.to(at(1) - 100 + 20 + H.gapMs)
    expect(s.said()).toEqual(['Okay.', 'One sec.'])
  })

  it('stop at once when the person speaks, and say nothing while they hold the floor', () => {
    const s = setup()
    s.send()
    s.to(at(0))
    s.publish({ kind: 'orchestration.floor', state: 'person-speaking' })
    expect(s.log).toEqual(['p0 enqueue 0', 'p0 close'])
    s.to(at(2))
    expect(s.made).toHaveLength(1)
  })

  it('leave active listening and encouragement phrases to their player: one plays when asked, heard for the echo check, and the person speaking stops it', () => {
    const s = setup({ clips: [] })
    s.speaker.phrase({ conversationId: C, text: 'Yes?', tier: 0, use: 'encouragement', audio: new Uint8Array(8) })
    s.publish({ kind: 'orchestration.floor', state: 'person-pausing' })
    s.publish({ kind: 'orchestration.phrase', phrase: 'encouragement' })
    s.to(20)
    expect(s.said()).toEqual(['Yes?'])
    expect(s.out.some(e => e.kind === 'playback.frame')).toBe(true)
    s.publish({ kind: 'orchestration.floor', state: 'person-speaking' })
    expect(s.log).toEqual(['p0 enqueue 0', 'p0 close'])
  })

  it('say nothing once the turn ended with nothing to say, nor before hq sends them', () => {
    const s = setup()
    s.send()
    s.speaker.turn({ conversationId: C, turnId: 'r1', state: 'COMPLETED' } as never)
    s.to(at(3))
    expect(s.made).toHaveLength(0)
    const none = setup({ clips: [] })
    none.send()
    none.to(at(3))
    expect(none.made).toHaveLength(0)
  })
})
