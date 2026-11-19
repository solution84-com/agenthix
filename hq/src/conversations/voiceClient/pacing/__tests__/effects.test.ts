/**
 * What the learned pace and the listening style do (spec §When a turn ends → *Adaptive pacing*; §The light model →
 * *Listening style*): the scheduler holds READY for the learned wait in every turn, `patient` adds 1 s; the backchannel's
 * hum window follows the pace, `hums_off` stops the hums, `hums_fewer` doubles their spacing; `normal` undoes them.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { scheduler } from '../../orchestration/scheduler'
import { KEEPING_UP, rig, silence } from '../../orchestration/__tests__/setup'
import { ON, setup as humSetup } from '../../backchannel/__tests__/backchannelRig'
import type { VoiceSettings } from '../../settings'
import { learnedOf } from '../pace'
import { PACING_SETTINGS } from '../settings'
import type { ListenStyleState } from '../style'

const LIGHT: VoiceSettings = { ...KEEPING_UP, voiceListener: true, adaptiveVoice: true }
const READY: VoiceEventBody = { kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs: 500, by: 'model' }
const paced = (ms: number): VoiceEventBody => {
  const breathMs = [ms, ms, ms, ms, ms]
  return { kind: 'orchestration.pace', heard: 5, breathMs, learned: learnedOf(breathMs, PACING_SETTINGS) }
}
const style = (state: ListenStyleState): VoiceEventBody => ({ kind: 'listen.style', state })

function turns(settings: VoiceSettings = LIGHT) {
  const r = rig([scheduler], ['orchestration.ready', 'orchestration.finishHeld'], settings)
  /** They speak from `at` for 1 s and go quiet; the sound model says READY at 0.5 s of quiet. */
  const sentence = (at: number) => {
    r.at(at, silence(false))
    r.at(at + 100, { kind: 'stt.utterance', text: 'we left really early' })
    r.at(at + 1_000, silence(true))
    r.tickTo(at + 1_500)
    r.at(at + 1_500, READY)
  }
  const readies = () => r.of('orchestration.ready').map(({ t, waitedMs, paced: p, patient }) => ({ t, waitedMs, ...(p && { paced: p }), ...(patient && { patient }) }))
  return { ...r, sentence, readies }
}

describe('the finish wait, learned @SC-2231', () => {
  it('holds READY for the learned wait in the first turn, with no false finish', () => {
    const s = turns()
    s.at(0, paced(1_500))
    s.sentence(1_000)
    expect(s.readies()).toEqual([])
    expect(s.of('orchestration.finishHeld')).toMatchObject([{ waitMs: 1_700, until: 3_700 }])
    s.tickTo(3_650)
    expect(s.readies()).toEqual([])
    s.tickTo(3_700)
    expect(s.readies()).toEqual([{ t: 3_700, waitedMs: 1_700, paced: true }])
  })

  it('is today\'s with adaptive pacing switched off', () => {
    const s = turns({ ...LIGHT, pacing: { ...PACING_SETTINGS, on: false } })
    s.at(0, paced(1_500))
    s.sentence(1_000)
    expect(s.readies()).toEqual([{ t: 2_500, waitedMs: undefined }])
  })
})

describe('the listening style @SC-2232', () => {
  it('patient: 1 s more quiet than the wait in force, with or without a learned pace; normal undoes it', () => {
    const s = turns()
    s.at(0, style({ hums: 'on', patient: true }))
    s.sentence(1_000)
    s.tickTo(4_000)
    expect(s.readies()).toEqual([{ t: 3_500, waitedMs: 1_500, patient: true }])

    s.at(4_100, paced(1_500))
    s.sentence(10_000)
    s.tickTo(14_000)
    expect(s.readies()[1]).toEqual({ t: 13_700, waitedMs: 2_700, paced: true, patient: true })

    s.at(14_100, style({ hums: 'on', patient: false }))
    s.sentence(20_000)
    s.tickTo(23_000)
    expect(s.readies()[2]).toEqual({ t: 22_700, waitedMs: 1_700, paced: true })
  })

  it('hums_off: no hum at all, a near miss saying you asked for none; normal brings them back', () => {
    const s = humSetup(ON)
    s.at(0, style({ hums: 'off', patient: false }))
    s.talk(0, 5_000)
    s.tickTo(6_000)
    s.at(6_100, silence(false))
    expect(s.hums()).toEqual([])
    expect(s.misses().at(-1)?.why).toBe('you asked for no hums')
    s.at(6_200, style({ hums: 'on', patient: false }))
    s.talk(6_100, 11_000)
    s.tickTo(12_000)
    expect(s.hums()).toHaveLength(1)
  })

  it('hums_fewer: twice the speech between hums', () => {
    const s = humSetup(ON)
    s.at(0, style({ hums: 'fewer', patient: false }))
    s.talk(0, 5_000)
    s.tickTo(6_000)
    s.at(6_100, silence(false))
    expect(s.hums()).toEqual([])
    expect(s.misses().at(-1)?.why).toContain('only 5.0 s of speech')
    s.talk(6_100, 9_500)
    s.tickTo(10_500)
    expect(s.hums()).toHaveLength(1)
  })

  it('the hum window\'s latest start follows the pace: 0.8 s for a quick speaker, so a verdict at 0.85 s has no hum', () => {
    const run = (withPace: boolean) => {
      const s = humSetup(ON)
      if (withPace) s.at(0, paced(500))
      s.at(0, silence(false))
      s.at(100, { kind: 'stt.utterance', text: 'and then we walked on' })
      s.at(5_000, silence(true))
      s.tickTo(5_850)
      s.at(5_850, { kind: 'semantics.decision', answer: 'UNCERTAIN', confidence: 0.5, silenceMs: 850, by: 'model' })
      s.tickTo(6_500)
      return s.hums()
    }
    expect(run(false)).toHaveLength(1)
    expect(run(true)).toEqual([])
  })
})
