/**
 * Adaptive pacing's listener (spec §When a turn ends → *Adaptive pacing*): which pauses are breaths, and that what it
 * learns lives in the page's memory only, per conversation, carried across voice starting again and never stored.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeClock } from '../../clock'
import type { VoiceEvent } from '../../events'
import { KEEPING_UP, playing, rig, silence } from '../../orchestration/__tests__/setup'
import { createVoiceRuntime } from '../../runtime/runtime'
import type { VoiceSettings } from '../../settings'
import { pace } from '../component'
import { forgetPaces, paceMemory, remembered } from '../memory'
import { NORMAL_STYLE } from '../style'

const LIGHT: VoiceSettings = { ...KEEPING_UP, voiceListener: true, adaptiveVoice: true }

function setup(settings: VoiceSettings = LIGHT) {
  const r = rig([pace], ['orchestration.pace'], settings)
  const breaths = () => r.of('orchestration.pace').at(-1)?.breathMs ?? []
  /** They pause at `at` for `ms`, then go on. */
  const breathe = (at: number, ms: number) => { r.at(at, silence(true)); r.at(at + ms, silence(false)) }
  return { ...r, breaths, breathe }
}

describe('a breath: a pause in their turn after which they went on @SC-2231', () => {
  it('each pause they go on after is one, a false finish included (no sound came before they went on)', () => {
    const s = setup()
    s.at(0, silence(false))
    s.breathe(1_000, 700)
    s.at(1_900, { kind: 'orchestration.send', text: 'we left', append: false, via: 'listen' })
    s.breathe(2_000, 1_300)
    expect(s.breaths()).toEqual([700, 1_300])
    expect(s.of('orchestration.pace').at(-1)).toMatchObject({ heard: 2, learned: null })
  })

  it('a pause in which a reply or a line played is none; a hum is no answer, so a pause with one still counts', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(1_000, silence(true))
    s.at(1_400, playing('r1'))
    s.at(4_000, silence(false))
    s.at(5_000, silence(true))
    s.at(5_200, { kind: 'phrase.at', text: 'Right.', playing: true, lineId: 'L1' })
    s.at(5_900, silence(false))
    s.at(7_000, silence(true))
    s.at(7_500, { kind: 'phrase.at', text: 'Mm-hm.', playing: true, backchannel: true })
    s.at(8_100, silence(false))
    expect(s.breaths()).toEqual([1_100])
  })

  it('a pause past the pause cap is none: it ended the turn whatever was learned', () => {
    const s = setup()
    s.at(0, silence(false))
    s.breathe(1_000, 3_200)
    expect(s.breaths()).toEqual([])
  })

  it('sets the learned values from the fifth', () => {
    const s = setup()
    s.at(0, silence(false))
    for (let i = 0; i < 4; i++) s.breathe(1_000 + i * 3_000, 1_000)
    expect(s.of('orchestration.pace').at(-1)!.learned).toBeNull()
    s.breathe(20_000, 1_000)
    expect(s.of('orchestration.pace').at(-1)!.learned).toMatchObject({ finishWaitMs: 1_200, latestPauseMs: 1_000 })
  })

  it('learns nothing with Adaptive voice off', () => {
    const s = setup({ ...LIGHT, adaptiveVoice: false })
    s.at(0, silence(false))
    s.breathe(1_000, 700)
    expect(s.of('orchestration.pace')).toEqual([])
  })
})

describe('per conversation, in the page\'s memory only @SC-2232', () => {
  afterEach(() => forgetPaces())

  const voice = (conversationId: string) => {
    const runtime = createVoiceRuntime({ components: [pace], adapters: [paceMemory({ conversationId: () => conversationId })], settings: LIGHT, clock: fakeClock() })
    const out: VoiceEvent[] = []
    runtime.subscribe(['orchestration.pace', 'listen.style'], e => out.push(e))
    runtime.start()
    return { runtime, out }
  }
  const breathe = (rt: ReturnType<typeof voice>['runtime'], at: number, ms: number) => {
    rt.publish({ kind: 'acoustic.silence', silent: true, t: at })
    rt.publish({ kind: 'acoustic.silence', silent: false, t: at + ms })
  }

  it('carries the pace and style across voice starting again in the same conversation, and not into another', () => {
    const first = voice('c1')
    first.runtime.publish({ kind: 'acoustic.silence', silent: false, t: 0 })
    for (let i = 0; i < 5; i++) breathe(first.runtime, 1_000 + i * 2_000, 900)
    first.runtime.publish({ kind: 'listen.style', state: { hums: 'off', patient: true }, asked: 'patient', t: 12_000 })
    first.runtime.stop()

    const again = voice('c1')
    expect(again.out[0]).toMatchObject({ kind: 'orchestration.pace', heard: 5, breathMs: [900, 900, 900, 900, 900], learned: { finishWaitMs: 1_100 } })
    expect(again.out[1]).toMatchObject({ kind: 'listen.style', state: { hums: 'off', patient: true }, restored: true })

    expect(voice('c2').out).toEqual([])
  })

  it('writes nothing to the browser\'s storage; a reload starts from the defaults', () => {
    const storage = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0 }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('sessionStorage', storage)
    try {
      const v = voice('c1')
      v.runtime.publish({ kind: 'acoustic.silence', silent: false, t: 0 })
      for (let i = 0; i < 6; i++) breathe(v.runtime, 1_000 + i * 2_000, 800)
      v.runtime.publish({ kind: 'listen.style', state: { hums: 'fewer', patient: false }, asked: 'hums_fewer', t: 14_000 })
      expect(storage.setItem).not.toHaveBeenCalled()
      expect(remembered('c1')).toMatchObject({ heard: 6, style: { hums: 'fewer', patient: false } })
    } finally {
      vi.unstubAllGlobals()
    }
    forgetPaces()
    expect(remembered('c1')).toBeUndefined()
    expect(voice('c1').out).toEqual([])
    expect(NORMAL_STYLE).toEqual({ hums: 'on', patient: false })
  })
})
