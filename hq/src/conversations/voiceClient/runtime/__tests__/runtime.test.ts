import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import type { VoiceEventInput } from '../../events'
import { VOICE_SETTINGS } from '../../settings'
import { createVoiceRuntime } from '../runtime'
import type { Component } from '../types'

/** Counts silence changes, and says "send" on the second one. */
const counter: Component<{ changes: number }> = {
  name: 'counter',
  accepts: ['acoustic.silence'],
  init: () => ({ changes: 0 }),
  step: (state, event) => {
    const changes = state.changes + 1
    const emit: VoiceEventInput[] = changes === 2 ? [{ kind: 'orchestration.send', text: 'hi', append: false, t: event.t }] : []
    return { state: { changes }, emit }
  },
}

describe('the runtime', () => {
  it('delivers events to the components that accept them, and what they emit to everyone after', () => {
    const runtime = createVoiceRuntime({ components: [counter], adapters: [], settings: VOICE_SETTINGS, clock: fakeClock() })
    const seen: string[] = []
    runtime.subscribe(['orchestration.send'], e => seen.push(e.kind))
    runtime.publish({ kind: 'acoustic.silence', silent: false, t: 1 })
    runtime.publish({ kind: 'acoustic.vadScore', confidence: 0.9, t: 2 })
    runtime.publish({ kind: 'acoustic.silence', silent: true, t: 3 })
    expect(seen).toEqual(['orchestration.send'])
    expect(runtime.log().map(e => e.seq)).toEqual([0, 1, 2, 3])
  })

  it('ticks the clock while started, and starts and stops its adapters', () => {
    const clock = fakeClock()
    let stopped = false
    const runtime = createVoiceRuntime({
      components: [], settings: VOICE_SETTINGS, clock, tickMs: 50,
      adapters: [{ name: 'mic', start: rt => { rt.publish({ kind: 'acoustic.silence', silent: true, t: rt.now() }); return () => { stopped = true } } }],
    })
    runtime.start()
    clock.advance(200)
    runtime.stop()
    clock.advance(200)
    expect(runtime.log().filter(e => e.kind === 'clock.tick')).toHaveLength(4)
    expect(runtime.log()[0]!.kind).toBe('acoustic.silence')
    expect(stopped).toBe(true)
  })

  it('drops a replaceable reading at a full queue, never what the person said, and records it', () => {
    let held = true
    const holder: Component<null> = {
      name: 'holder', accepts: ['acoustic.silence'], init: () => null,
      // While held, each silence change emits three scores and a frame into the inbound queue.
      step: (s, e) => ({ state: s, emit: held ? [
        { kind: 'acoustic.vadScore', confidence: 0.1, t: e.t },
        { kind: 'acoustic.vadScore', confidence: 0.2, t: e.t },
        { kind: 'audio.frame', pcm: new Int16Array(512), t: e.t },
      ] : [] }),
    }
    const runtime = createVoiceRuntime({
      components: [holder], adapters: [], settings: VOICE_SETTINGS, clock: fakeClock(), queueLimits: { inbound: 2 },
    })
    runtime.publish({ kind: 'acoustic.silence', silent: true, t: 0 })
    held = false
    const kinds = runtime.log().map(e => e.kind)
    expect(kinds).toContain('audio.frame')
    expect(kinds.filter(k => k === 'acoustic.vadScore')).toHaveLength(1)
    expect(runtime.overflows()[0]!.dropped.kind).toBe('acoustic.vadScore')
  })

  it('cancels a reply in every loop', () => {
    const fanOut: Component<null> = {
      name: 'fan', accepts: ['orchestration.floor'], init: () => null,
      step: (s, e) => ({ state: s, emit: [
        { kind: 'reply.sentence', replyId: 'r1', index: 0, text: 'old', t: e.t },
        { kind: 'reply.sentence', replyId: 'r2', index: 0, text: 'new', t: e.t },
      ] }),
    }
    const runtime = createVoiceRuntime({ components: [fanOut], adapters: [], settings: VOICE_SETTINGS, clock: fakeClock() })
    const texts: string[] = []
    runtime.subscribe(['reply.sentence'], e => {
      if (e.kind !== 'reply.sentence') return
      texts.push(e.text)
      if (e.replyId === 'r1') runtime.cancelReply('r2')
    })
    runtime.publish({ kind: 'orchestration.floor', state: 'agent-speaking', t: 0 })
    expect(texts).toEqual(['old'])
  })
})
