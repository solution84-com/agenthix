/** What the page sends about the light model, checked before it reaches anything. */
import { describe, expect, it } from 'vitest'
import { LIGHT_OFF, lightConfigFrom, listenPayloadFrom } from '../payload'

describe('the light model payloads from the page @SC-1840 @SC-2224', () => {
  it('takes a listen as hq takes one, and refuses a malformed one', () => {
    expect(listenPayloadFrom({ seq: 3, moment: 'quiet', text: 'So', quietMs: 4000, keptOpen: true })).toEqual({ seq: 3, moment: 'quiet', text: 'So', quietMs: 4000, keptOpen: true })
    expect(listenPayloadFrom({ seq: 1, moment: 'working', text: '', quietMs: 0, workingMs: 9e9 })).toMatchObject({ workingMs: 3_600_000 })
    expect(listenPayloadFrom({ seq: 1.5, moment: 'quiet', text: '', quietMs: 0 })).toBeNull()
    expect(listenPayloadFrom({ seq: 1, moment: 'shout', text: '', quietMs: 0 })).toBeNull()
    expect(listenPayloadFrom({ seq: 1, moment: 'quiet', text: 'x', quietMs: -1 })).toBeNull()
  })

  it('makes the light model settings safe, off by default', () => {
    expect(lightConfigFrom(null)).toEqual(LIGHT_OFF)
    expect(lightConfigFrom({ on: true, model: 'p1/flash', settings: { caps: { hum: 2 } }, lead: { kind: 'model', model: 'p1/big' }, adaptiveVoice: false, lineDirection: 'stored' }))
      .toEqual({ on: true, model: 'p1/flash', settings: { caps: { hum: 2 } }, lead: { kind: 'model', model: 'p1/big' }, adaptiveVoice: false, lineDirection: 'stored', humModel: null, humSteering: {} })
    // The hum service's model and the tones' steering the page changed: only known tones, each a bracketed direction.
    expect(lightConfigFrom({ humModel: 'p1/flash', humSteering: { gentle: ' [quiet, sad] ', loud: '[x]', calm: 'no brackets' } }))
      .toMatchObject({ humModel: 'p1/flash', humSteering: { gentle: '[quiet, sad]' } })
    expect(lightConfigFrom({ on: 'yes', model: 7, settings: [1], lead: { kind: 'other' }, lineDirection: 'loud' })).toEqual({ ...LIGHT_OFF, adaptiveVoice: true })
    // The light model's lines are spoken plainly unless the page asks for the stored phrases' direction.
    expect(LIGHT_OFF.lineDirection).toBe('plain')
  })
})
