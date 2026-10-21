import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClock } from '../../clock'
import type { VoiceEvent, VoiceEventBody } from '../../events'
import type { Playback, Playhead } from '../../playback'
import { createVoiceRuntime } from '../../runtime/runtime'
import type { VoiceRuntime } from '../../runtime/types'
import { VOICE_SETTINGS } from '../../settings'
import { IDLE, type VoiceSnapshot } from '../../voiceSnapshot'
import { createSpeaker } from '../speaker'

const C = 'c1'

function setup() {
  let snap: VoiceSnapshot = { ...IDLE, conversationId: C, phase: 'thinking' }
  const calls: string[] = []
  const enqueued: Array<[string, number]> = []
  let head: Playhead | null = null
  let audio: Int16Array = new Int16Array(0)
  let current = ''
  const playback: Playback = {
    enqueue: (i) => { enqueued.push([current, i]) },
    finish: () => undefined,
    stop: () => { calls.push('stop'); return 0 },
    position: () => head,
    idle: () => false,
    close: () => undefined,
    duck: (db, ms) => { calls.push(`duck ${db} ${ms}`) },
    resume: (ms) => { calls.push(`resume ${ms}`) },
    heardAudio: () => { const a = audio; audio = new Int16Array(0); return a },
  }
  const interrupts: unknown[] = []
  const hq = { start: vi.fn(), end: vi.fn(), activity: vi.fn(), interrupt: (...a: unknown[]) => { interrupts.push(a) } }
  let runtime: VoiceRuntime | null = null
  const speaker = createSpeaker({
    snapshot: () => snap, set: (p) => { snap = { ...snap, ...p } }, createPlayback: () => playback,
    hq: hq as never, runtime: () => runtime,
  })
  runtime = createVoiceRuntime({ components: [], adapters: [speaker.adapter], settings: VOICE_SETTINGS, clock: fakeClock() })
  runtime.start()
  const out: VoiceEvent[] = []
  runtime.subscribe('*', e => { if (e.kind !== 'clock.tick') out.push(e) })
  const rt = runtime
  const publish = (e: VoiceEventBody) => rt.publish({ ...e, t: 0 })
  const sentence = (turnId: string, index = 0) => {
    current = turnId
    speaker.sentence({ conversationId: C, turnId, index, text: 'Hi.', textStart: 0, textEnd: 3, words: ['Hi'], wordStartSecs: [0], wordEndSecs: [0.3] })
    speaker.audio({ conversationId: C, turnId, index, audio: new ArrayBuffer(4) })
  }
  return {
    speaker, publish, sentence, calls, enqueued, interrupts, out,
    snap: () => snap,
    setHead: (h: Playhead | null) => { head = h },
    setAudio: (a: Int16Array) => { audio = a },
    tick: () => rt.publish({ kind: 'clock.tick', t: 0 }),
    kinds: () => out.map(e => e.kind),
  }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('the speaker: duck, resume, stop', () => {
  it('ducks and resumes the reply in the page, with the settings’ levels and ramps', () => {
    const s = setup()
    s.sentence('r1')
    s.publish({ kind: 'orchestration.playback', action: 'duck', replyId: 'r1' })
    s.publish({ kind: 'orchestration.playback', action: 'resume', replyId: 'r1' })
    expect(s.calls).toEqual([`duck ${VOICE_SETTINGS.bargeIn.duckDb} ${VOICE_SETTINGS.bargeIn.duckRampMs}`, `resume ${VOICE_SETTINGS.bargeIn.resumeRampMs}`])
  })

  it('stops locally, tells hq what was heard, and never plays that reply again', () => {
    const s = setup()
    s.sentence('r1')
    s.publish({ kind: 'orchestration.playback', action: 'stop', replyId: 'r1' })
    expect(s.calls).toEqual(['stop'])
    expect(s.interrupts).toEqual([[C, 'r1', 0]])
    expect(s.out.find(e => e.kind === 'orchestration.cancel')).toMatchObject({ replyId: 'r1', heardThrough: 0 })
    s.sentence('r1', 1)
    expect(s.enqueued).toEqual([['r1', 0]])
    s.sentence('r2')
    expect(s.enqueued).toEqual([['r1', 0], ['r2', 0]])
  })
})

describe('the speaker: a reply that comes while the person holds the floor', () => {
  it('waits, and plays when the floor is the agent’s again', () => {
    const s = setup()
    s.publish({ kind: 'orchestration.floor', state: 'person-speaking' })
    s.sentence('r1')
    expect(s.enqueued).toEqual([])
    s.publish({ kind: 'orchestration.floor', state: 'agent-thinking' })
    expect(s.enqueued).toEqual([['r1', 0]])
  })

  it('is dropped when the person’s words join its message', () => {
    const s = setup()
    s.publish({ kind: 'orchestration.floor', state: 'person-speaking' })
    s.sentence('r1')
    s.publish({ kind: 'orchestration.send', text: 'and more', append: true })
    s.publish({ kind: 'orchestration.floor', state: 'agent-thinking' })
    s.sentence('r1', 1)
    expect(s.enqueued).toEqual([])
    s.sentence('r2')
    expect(s.enqueued).toEqual([['r2', 0]])
  })

  it('waits while the person has words not yet sent, though their voice was missed, and is dropped when they join', () => {
    const s = setup()
    s.publish({ kind: 'orchestration.floor', state: 'agent-thinking' })
    s.publish({ kind: 'stt.utterance', text: 'no, that was wrong' })
    s.sentence('r1')
    expect(s.enqueued).toEqual([])
    s.publish({ kind: 'orchestration.send', text: 'no, that was wrong', append: true })
    expect(s.enqueued).toEqual([])
  })

  it('plays once words not yet sent turn out to be none', () => {
    const s = setup()
    s.publish({ kind: 'orchestration.floor', state: 'agent-thinking' })
    s.publish({ kind: 'stt.utterance', text: 'mm' })
    s.sentence('r1')
    s.publish({ kind: 'stt.utterance', text: '' })
    expect(s.enqueued).toEqual([['r1', 0]])
  })
})

describe('the speaker: what it publishes', () => {
  it('publishes what went to the speaker in 512-sample frames, keeping the rest for the next tick', () => {
    const s = setup()
    s.sentence('r1')
    s.setHead({ index: 0, elapsed: 0.1, ended: false })
    s.setAudio(new Int16Array(1_200).fill(7))
    s.tick()
    const frames = s.out.filter(e => e.kind === 'playback.frame')
    expect(frames.map(f => (f.kind === 'playback.frame' ? f.pcm.length : 0))).toEqual([512, 512])
    expect(frames[0]).toMatchObject({ replyId: 'r1' })
    s.setAudio(new Int16Array(400))
    s.tick()
    expect(s.out.filter(e => e.kind === 'playback.frame')).toHaveLength(3)
  })

  it('says a turn that ended with nothing spoken has no sentences, so the floor is free', () => {
    const s = setup()
    s.speaker.turn({ conversationId: C, turnId: 'r1', state: 'FAILED' })
    expect(s.out.find(e => e.kind === 'reply.spoken')).toMatchObject({ replyId: 'r1', sentences: 0 })
  })

  it('holds a completed reply\'s text until its voice, instead of showing it whole first', () => {
    const s = setup()
    s.speaker.delta({ conversationId: C, turnId: 'r1' } as never)
    s.speaker.turn({ conversationId: C, turnId: 'r1', state: 'COMPLETED' })
    expect(s.snap().reveal).toMatchObject({ turnId: 'r1', head: null })
    expect(s.out.some(e => e.kind === 'reply.spoken')).toBe(false)
    s.sentence('r1')
    expect(s.snap().reveal?.sentences).toHaveLength(1)
  })

  it('shows a completed reply whole once hq says none of it was spoken', () => {
    const s = setup()
    s.speaker.delta({ conversationId: C, turnId: 'r1' } as never)
    s.speaker.turn({ conversationId: C, turnId: 'r1', state: 'COMPLETED' })
    s.speaker.turnSpoken({ conversationId: C, turnId: 'r1', sentences: 0 })
    expect(s.snap().reveal).toBeNull()
    expect(s.out.find(e => e.kind === 'reply.spoken')).toMatchObject({ replyId: 'r1', sentences: 0 })
    expect(s.snap().phase).toBe('listening')
  })

  it('shows it whole when no speech comes for it', () => {
    const s = setup()
    s.speaker.delta({ conversationId: C, turnId: 'r1' } as never)
    s.speaker.turn({ conversationId: C, turnId: 'r1', state: 'COMPLETED' })
    vi.advanceTimersByTime(12_000)
    expect(s.snap().reveal).toBeNull()
    expect(s.out.find(e => e.kind === 'reply.spoken')).toMatchObject({ replyId: 'r1', sentences: 0 })
  })

  it('says nothing of the kind for a turn that was spoken', () => {
    const s = setup()
    s.sentence('r1')
    s.speaker.turnSpoken({ conversationId: C, turnId: 'r1', sentences: 1 })
    s.speaker.turn({ conversationId: C, turnId: 'r1', state: 'COMPLETED' })
    expect(s.out.filter(e => e.kind === 'reply.spoken').map(e => (e.kind === 'reply.spoken' ? e.sentences : -1))).toEqual([1])
  })
})
