import { describe, expect, it, vi } from 'vitest'
import { fakeClock } from '../../clock'
import type { VoiceEvent, VoiceEventBody } from '../../events'
import type { Playback } from '../../playback'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS, type VoiceSettings } from '../../settings'
import { IDLE, type VoiceSnapshot } from '../../voiceSnapshot'
import { createSpeaker } from '../speaker'

const C = 'c1'
const CEILING = VOICE_SETTINGS.standardAcknowledgement.ceilingMs

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
  { text: 'Okay, one moment.', tier: 1 }, { text: 'Right, bear with me.', tier: 1 },
  { text: 'Sorry, this is taking longer.', tier: 3 },
]

function setup(opts: { random?: number; clips?: typeof CLIPS; settings?: VoiceSettings } = {}) {
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
  runtime = createVoiceRuntime({ components: [], adapters: [speaker.adapter], settings: opts.settings ?? VOICE_SETTINGS, clock })
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
    snapshot: () => snap,
    now: () => clock.now(),
    send: (trailedOff = false) => {
      snap = { ...snap, phase: 'thinking' }
      publish({ kind: 'orchestration.send', text: 'hello', append: false, ...(trailedOff && { trailedOff }) })
    },
    /** To `ms` after the start, ticking every 20 ms on the way. */
    to: (ms: number) => { while (clock.now() < ms) { clock.advance(Math.min(20, ms - clock.now())); publish({ kind: 'clock.tick' }) } },
    /** The phrase playing ends, heard on the next tick. */
    finish: () => { made.at(-1)!.end(); clock.advance(20); publish({ kind: 'clock.tick' }) },
    sentence: (turnId: string) => {
      speaker.sentence({ conversationId: C, turnId, index: 0, text: 'Hi.', textStart: 0, textEnd: 3, words: ['Hi'], wordStartSecs: [0], wordEndSecs: [0.3] })
      speaker.audio({ conversationId: C, turnId, index: 0, audio: new ArrayBuffer(4) })
    },
  }
}

describe('the standard acknowledgement @SC-995 @SC-1832', () => {
  it('says nothing at once, nor before the ceiling', () => {
    const s = setup()
    s.send()
    s.to(CEILING - 20)
    expect(s.said()).toEqual([])
    expect(s.made).toHaveLength(0)
  })

  it('says one stored phrase of its tier once at the ceiling, and nothing more however long the wait', () => {
    const s = setup()
    s.send()
    s.to(CEILING)
    expect(s.said()).toEqual(['Right, bear with me.'])
    s.finish()
    s.to(60_000)
    expect(s.said()).toEqual(['Right, bear with me.'])
    expect(s.made).toHaveLength(1)
  })

  it('says one of the nearest tier when its own tier has none', () => {
    const s = setup({ clips: [{ text: 'Mm.', tier: 0 }, { text: 'Still on it.', tier: 3 }] })
    s.send()
    s.to(CEILING)
    expect(s.said()).toEqual(['Mm.'])
  })

  it('says nothing when a reply starts before the ceiling, by its text or its first sentence', () => {
    const bySentence = setup()
    bySentence.send()
    bySentence.to(CEILING - 1_000)
    bySentence.sentence('r1')
    bySentence.to(CEILING + 5_000)
    expect(bySentence.said()).toEqual([])

    const byText = setup()
    byText.send()
    byText.to(CEILING - 1_000)
    byText.speaker.delta({ conversationId: C, turnId: 'r1', offset: 0, text: 'Let me look' } as never)
    byText.to(CEILING + 5_000)
    expect(byText.said()).toEqual([])
  })

  it('says nothing for a turn hq held: no reply will come', () => {
    const s = setup()
    s.send()
    s.to(500)
    s.speaker.held({ conversationId: C, turnId: 'r1' })
    s.to(CEILING + 5_000)
    expect(s.said()).toEqual([])
    expect(s.snapshot().phase).toBe('listening')
    expect(s.out.filter(e => e.kind === 'reply.held')).toMatchObject([{ replyId: 'r1' }])
  })

  it('says nothing with the person\'s Adaptive voice off', () => {
    const s = setup({ settings: { ...VOICE_SETTINGS, adaptiveVoice: false } })
    s.send()
    s.to(CEILING + 5_000)
    expect(s.said()).toEqual([])
  })

  it('says nothing for a message sent as the person trailed off', () => {
    const s = setup()
    s.send(true)
    s.to(CEILING + 5_000)
    expect(s.said()).toEqual([])
  })

  it('says none of the last few again while another can be said', () => {
    const mixes = ['Okay, one moment.', 'Right, bear with me.', 'Mm, okay, on it.', 'Understood, one sec.', 'Hmm, okay, let me think.', 'Ah, okay, just a sec.', 'Okay, won\'t be long.']
    const s = setup({ random: 0, clips: mixes.map(text => ({ text, tier: 1 })) })
    for (let i = 0; i < 6; i++) {
      s.send(); s.to(s.now() + CEILING); s.finish()
      s.speaker.turn({ conversationId: C, turnId: `r${i}`, state: 'COMPLETED' } as never)
    }
    const heard = s.said()
    expect(heard).toHaveLength(6)
    const recent = VOICE_SETTINGS.standardAcknowledgement.recent
    for (let i = 0; i < heard.length; i++) expect(heard.slice(Math.max(0, i - recent), i)).not.toContain(heard[i])
  })

  it('is heard for the echo check, and is part of no reply', () => {
    const s = setup()
    s.send()
    s.to(CEILING)
    expect(s.out.some(e => e.kind === 'playback.frame')).toBe(true)
    expect(s.out.some(e => e.kind === 'playback.at' || e.kind === 'reply.sentence')).toBe(false)
  })

  it('finishes when the reply begins while it plays, and the reply waits for it', () => {
    const s = setup()
    s.send()
    s.to(CEILING)
    s.sentence('r1')
    expect(s.log).toEqual(['p0 enqueue 0'])
    s.finish()
    expect(s.log).toEqual(['p0 enqueue 0', 'p0 close', 'p1 enqueue 0'])
  })

  it('stops at once when the person speaks, and is not said while they hold the floor', () => {
    const playing = setup()
    playing.send()
    playing.to(CEILING)
    playing.publish({ kind: 'orchestration.floor', state: 'person-speaking' })
    expect(playing.log).toEqual(['p0 enqueue 0', 'p0 close'])

    const holding = setup()
    holding.send()
    holding.publish({ kind: 'orchestration.floor', state: 'person-speaking' })
    holding.to(CEILING + 5_000)
    expect(holding.made).toHaveLength(0)
  })

  it('leaves the listening family\'s clips to their player: one plays when asked, heard for the echo check, and the person speaking stops it', () => {
    const s = setup({ clips: [] })
    s.speaker.phrase({ conversationId: C, text: 'Yes?', tier: 3, use: 'encouragement', audio: new Uint8Array(8) })
    s.publish({ kind: 'orchestration.floor', state: 'person-pausing' })
    s.publish({ kind: 'orchestration.phrase', tiers: ['invitation'] })
    s.to(20)
    expect(s.said()).toEqual(['Yes?'])
    expect(s.out.some(e => e.kind === 'playback.frame')).toBe(true)
    s.publish({ kind: 'orchestration.floor', state: 'person-speaking' })
    expect(s.log).toEqual(['p0 enqueue 0', 'p0 close'])
  })

  it('says nothing once the turn ended with nothing to say, nor before hq sends the phrases', () => {
    const s = setup()
    s.send()
    s.speaker.turn({ conversationId: C, turnId: 'r1', state: 'COMPLETED' } as never)
    s.to(CEILING + 5_000)
    expect(s.made).toHaveLength(0)
    const none = setup({ clips: [] })
    none.send()
    none.to(CEILING + 5_000)
    expect(none.made).toHaveLength(0)
  })
})
