import { describe, expect, it } from 'vitest'
import type { RoomLabel, VoiceEventBody, VoiceEventInput } from '../../events'
import { VOICE_SETTINGS } from '../../settings'
import { headphonesAdvice } from '../advice'
import { stepper } from './signals'

function setup() {
  const advice = stepper(headphonesAdvice)
  let t = 0
  const step = (event: VoiceEventBody) => advice.step({ ...event, t } as VoiceEventInput)
  const until = (ms: number) => { for (; t < ms; t += 50) step({ kind: 'clock.tick' }) ; step({ kind: 'clock.tick' }) }
  return {
    until,
    echo: (level: number) => step({ kind: 'acoustic.echoLevel', level }),
    room: (label: RoomLabel) => step({ kind: 'acoustic.room', label }),
    output: (output: 'headphones' | 'speakers' | 'unknown') => step({
      kind: 'acoustic.device', output, sampleRate: 16_000,
      processing: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }),
    given: () => advice.emitted.flatMap(e => (e.kind === 'acoustic.advice' ? [{ advice: e.advice, t: e.t }] : [])),
  }
}

const HIGH = VOICE_SETTINGS.echo.headphonesAbove + 0.1

describe('the headphones advice', () => {
  it('suggests headphones once the echo has stayed high for a few seconds', () => {
    const a = setup()
    a.echo(HIGH)
    a.until(VOICE_SETTINGS.advice.afterMs - 100)
    expect(a.given()).toEqual([])
    a.until(VOICE_SETTINGS.advice.afterMs)
    expect(a.given()).toEqual([{ advice: 'headphones', t: VOICE_SETTINGS.advice.afterMs }])
  })

  it('suggests them in a room with other voices, wind or bursts of noise, and not for a steady fan', () => {
    for (const label of ['other-voices', 'wind', 'intermittent-noise'] as const) {
      const a = setup()
      a.room(label)
      a.until(VOICE_SETTINGS.advice.afterMs)
      expect(a.given().map(g => g.advice)).toEqual(['headphones'])
    }
    const fan = setup()
    fan.room('steady-noise')
    fan.until(VOICE_SETTINGS.advice.afterMs * 3)
    expect(fan.given()).toEqual([])
  })

  it('does not suggest a short spike, and withdraws the advice once things have been fine for a while', () => {
    const a = setup()
    a.echo(HIGH)
    a.until(1_000)
    a.echo(0.1)
    a.until(VOICE_SETTINGS.advice.afterMs * 2)
    expect(a.given()).toEqual([])
    a.echo(HIGH)
    a.until(VOICE_SETTINGS.advice.afterMs * 4)
    a.echo(0.1)
    a.until(VOICE_SETTINGS.advice.afterMs * 4 + VOICE_SETTINGS.advice.clearAfterMs - 100)
    expect(a.given().map(g => g.advice)).toEqual(['headphones'])
    a.until(VOICE_SETTINGS.advice.afterMs * 4 + VOICE_SETTINGS.advice.clearAfterMs)
    expect(a.given().map(g => g.advice)).toEqual(['headphones', null])
  })

  it('never suggests headphones to a person wearing them, and withdraws it when they put them on', () => {
    const a = setup()
    a.output('headphones')
    a.echo(HIGH)
    a.until(VOICE_SETTINGS.advice.afterMs * 2)
    expect(a.given()).toEqual([])
    const b = setup()
    b.room('other-voices')
    b.until(VOICE_SETTINGS.advice.afterMs)
    b.output('headphones')
    expect(b.given().map(g => g.advice)).toEqual(['headphones', null])
  })
})
