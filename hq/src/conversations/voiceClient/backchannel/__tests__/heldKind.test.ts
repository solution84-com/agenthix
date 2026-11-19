/**
 * The held kind meets the pause rules (spec §The backchannel): when a hum is due, it is of the hum service's latest
 * answer, kept through a send while the turn is open; `none` plays nothing and is a near miss; with the service off,
 * failed or out of time, a plain continuer; while its first answer is on the way, nothing (a near miss).
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { silence } from '../../orchestration/__tests__/setup'
import { WITH_SERVICE as ON, setup as rigged, verdict } from './backchannelRig'

const setup = (settings = ON) => rigged(settings)

const held = (call: number, kind: 'none' | 'continuer' | 'sympathy', askedAt: number, ms = 400, fallback?: 'off' | 'timeout' | 'failed', tone: 'calm' | 'gentle' | 'bright' | null = kind === 'none' ? null : kind === 'sympathy' ? 'gentle' : 'calm'): VoiceEventBody =>
  ({ kind: 'hum.held', call, humKind: kind, tone, askedAt, ms, skipped: 0, ...(fallback && { fallback }) }) as VoiceEventBody

/** They speak from 0 to 4.5 s, the hum service answering as `answers` says, then pause; the sound model unsure at 0.5 s. */
function telling(s: ReturnType<typeof setup>, answers: [number, VoiceEventBody][], end = 4_500) {
  s.at(0, silence(false))
  s.at(100, { kind: 'stt.utterance', text: 'and then we walked on' })
  for (const [t, e] of answers) s.at(t, e)
  s.at(end, silence(true))
  s.tickTo(end + 450)
  s.at(end + 500, verdict('UNCERTAIN'))
  s.tickTo(end + 1_100)
}

const humsOf = (s: ReturnType<typeof setup>) => s.of('backchannel.hum').map(({ t, hum, tone, from, fallback }) => ({ t, kind: hum, tone, ...(from && { from }), ...(fallback && { fallback }) }))

describe('the kind of hum that plays @SC-2228', () => {
  it('is the hum service\'s latest answer, with the answer it came from', () => {
    const s = setup()
    telling(s, [[2_000, held(1, 'continuer', 1_500)], [4_000, held(2, 'sympathy', 3_600, 380)]])
    expect(humsOf(s)).toEqual([{ t: 5_050, kind: 'sympathy', tone: 'gentle', from: { call: 2, at: 4_000, ms: 380 } }])
  })

  it('takes the read\'s tone as it is: there is no table of allowed tones any more', () => {
    const s = setup()
    telling(s, [[4_400, held(1, 'sympathy', 4_000, 400, undefined, 'bright')]])
    expect(humsOf(s)).toMatchObject([{ kind: 'sympathy', tone: 'bright' }])
  })

  it('is none: nothing plays, a near miss says so, and their speech still counts toward the next', () => {
    const s = setup()
    telling(s, [[4_400, held(1, 'none', 4_000)]])
    expect(s.hums()).toEqual([])
    s.at(5_650, silence(false))
    s.at(5_700, { kind: 'stt.utterance', text: 'and then we walked on and on' })
    s.at(5_800, held(2, 'continuer', 5_700))
    s.at(6_000, silence(true))
    s.tickTo(6_450)
    s.at(6_500, verdict('UNCERTAIN'))
    s.tickTo(7_000)
    expect(s.misses().map(m => m.why)).toContain('the hum service said none')
    expect(s.hums()).toHaveLength(1)
  })

  it('falls back to a plain continuer only with the service off, failed or out of time', () => {
    const failed = setup()
    telling(failed, [[4_400, held(1, 'continuer', 4_000, 2_000, 'timeout')]])
    expect(humsOf(failed)).toMatchObject([{ kind: 'continuer', fallback: 'the hum service ran out of time' }])

    const late = setup()
    telling(late, [[3_000, { kind: 'hum.ask', call: 1, text: 'and then', skipped: 0 }], [5_100, { kind: 'hum.dropped', call: 1, humKind: 'sympathy', tone: 'gentle', ms: 2_100, waitedMs: 2_100, skipped: 0 }]])
    expect(humsOf(late)).toMatchObject([{ kind: 'continuer', fallback: 'the hum service ran out of time' }])

    const stuck = setup()
    telling(stuck, [[2_500, { kind: 'hum.ask', call: 1, text: 'and then', skipped: 0 }]])
    expect(humsOf(stuck)).toMatchObject([{ kind: 'continuer', fallback: 'the hum service ran out of time' }])

    const givenUp = setup()
    telling(givenUp, [[2_000, { kind: 'hum.ask', call: 1, text: 'and then', skipped: 0 }], [4_100, { kind: 'hum.ask', call: 2, text: 'and then we', skipped: 2 }]])
    expect(humsOf(givenUp)).toMatchObject([{ kind: 'continuer', fallback: 'the hum service ran out of time' }])

    const old = setup()
    telling(old, [[500, held(1, 'sympathy', 400)]])
    expect(humsOf(old)).toMatchObject([{ kind: 'sympathy', tone: 'gentle' }])

    const off = setup({ ...ON, backchannel: { ...ON.backchannel, serviceOn: false } })
    telling(off, [[4_400, held(1, 'sympathy', 4_000)]])
    expect(humsOf(off)).toMatchObject([{ kind: 'continuer', fallback: 'the hum service is off' }])
  })

  it('plays nothing while its first answer is still on the way, or before it was asked: a near miss', () => {
    const asking = setup()
    telling(asking, [[4_300, { kind: 'hum.ask', call: 1, text: 'and then we walked on', skipped: 0 }]])
    expect(asking.hums()).toEqual([])
    asking.at(5_200, silence(false))
    expect(asking.misses().map(m => m.why)).toEqual(['no answer from the hum service yet'])

    const never = setup()
    telling(never, [])
    expect(never.hums()).toEqual([])
  })

  it('outlives a send while the turn is kept open, and is forgotten once it is handed over @SC-2228', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, { kind: 'stt.utterance', text: 'and then we walked on' })
    s.at(4_400, held(1, 'sympathy', 4_000))
    s.at(4_450, { kind: 'stt.utterance', text: '' })
    s.at(4_460, { kind: 'stt.utterance', text: 'so anyway' })
    s.at(9_000, silence(true))
    s.tickTo(9_450)
    s.at(9_500, verdict('UNCERTAIN'))
    s.tickTo(10_100)
    expect(humsOf(s)).toMatchObject([{ kind: 'sympathy' }])

    const after = setup()
    after.at(0, silence(false))
    after.at(100, { kind: 'stt.utterance', text: 'and then we walked on' })
    after.at(4_400, held(1, 'sympathy', 4_000))
    after.at(4_500, { kind: 'listen.turn', state: 'handedOver' })
    after.at(4_600, { kind: 'playback.at', replyId: 'r1', index: 0, elapsedMs: 0, ended: false, playing: true })
    after.at(6_000, { kind: 'playback.at', replyId: 'r1', index: 0, elapsedMs: 0, ended: true, playing: false })
    after.at(6_500, silence(true))
    after.at(7_000, silence(false))
    after.at(7_100, { kind: 'stt.utterance', text: 'so anyway' })
    after.at(12_000, silence(true))
    after.tickTo(12_450)
    after.at(12_500, verdict('UNCERTAIN'))
    after.tickTo(13_100)
    expect(after.hums()).toEqual([])
  })
})
