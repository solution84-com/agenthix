/**
 * The hum spacing of 19 Nov (spec §Hum timing): a listening hum needs 6 s of the person's speech since the agent's last
 * sound, a reaction 3 s, and two reactions never come in a row without a listening hum or 8 s of speech between them.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { KEEPING_UP } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import { BACKCHANNEL_SETTINGS } from '../settings'
import type { HumKind, HumTone } from '../kinds'
import { setup } from './backchannelRig'

/** The first values as they ship: no reaction held over a later answer, so each breath plays the latest read. */
const NOW: VoiceSettings = { ...KEEPING_UP, voiceListener: true, adaptiveVoice: true, backchannel: { ...KEEPING_UP.backchannel, reactionHoldMs: 0 } }

let calls = 0
const held = (humKind: HumKind, tone: HumTone): VoiceEventBody => ({ kind: 'hum.held', call: ++calls, humKind, tone, askedAt: 0, ms: 400, skipped: 0 })

/** The speaker played the hum just due, as the sound keeper started it. */
function played(s: ReturnType<typeof setup>, t: number) {
  const due = s.of('backchannel.hum').at(-1)!
  s.at(t, { kind: 'backchannel.played', text: 'Mm.', hum: due.hum, tone: due.tone, made: 'kept', pausedMs: 500 })
}

describe('the hum spacing of 19 Nov @SC-2226 @SC-2228', () => {
  it('ships at 6 s for a listening hum, 3 s for a reaction, 8 s between two reactions in a row', () => {
    expect(BACKCHANNEL_SETTINGS).toMatchObject({ speechMs: 6_000, reactionSpeechMs: 3_000, reactionGapSpeechMs: 8_000 })
  })

  it('a listening hum on 5 s of speech is held back; on 6.5 s it plays', () => {
    const s = setup(NOW)
    s.at(50, held('continuer', 'calm'))
    s.talk(0, 5_000)
    s.tickTo(5_900)
    s.talk(6_000, 7_500)
    s.tickTo(8_400)
    expect(s.misses().map(m => m.why)).toEqual(["only 5.0 s of speech since the agent's last sound"])
    expect(s.hums().map(h => h.speechMs)).toEqual([6_500])
  })

  it('a reaction on 2.5 s is held back, on 3.5 s it plays', () => {
    const s = setup(NOW)
    s.at(50, held('sympathy', 'gentle'))
    s.talk(0, 2_500)
    s.tickTo(3_400)
    s.talk(3_500, 4_500)
    s.tickTo(5_400)
    expect(s.misses()[0]!.why).toBe("only 2.5 s of speech since the agent's last sound (a sympathy hum needs 3.0 s)")
    expect(s.of('backchannel.hum').map(h => [h.hum, h.speechMs])).toEqual([['sympathy', 3_500]])
  })

  it('never two reactions in a row: the second waits for 8 s of speech since the first', () => {
    const s = setup(NOW)
    s.at(50, held('sympathy', 'gentle'))
    s.talk(0, 3_500)
    s.tickTo(4_400)
    played(s, 4_410)
    s.at(4_500, held('delight', 'bright'))
    s.talk(4_500, 9_500)
    s.tickTo(10_400)
    s.at(10_500, held('delight', 'bright'))
    s.talk(10_500, 14_000)
    s.tickTo(14_900)
    expect(s.of('backchannel.hum').map(h => [h.hum, h.speechMs])).toEqual([['sympathy', 3_500], ['delight', 8_500]])
    expect(s.misses()[0]!.why).toBe('a reaction played 5.0 s of speech ago (a second needs a listening hum or 8.0 s between)')
  })

  it('a listening hum between two reactions lets the second come on its own spacing', () => {
    const s = setup({ ...NOW, backchannel: { ...NOW.backchannel, speechMs: 3_000 } })
    s.at(50, held('sympathy', 'gentle'))
    s.talk(0, 3_500)
    s.tickTo(4_400)
    played(s, 4_410)
    s.at(4_500, held('continuer', 'calm'))
    s.talk(4_500, 8_000)
    s.tickTo(8_900)
    played(s, 8_910)
    s.at(9_000, held('delight', 'bright'))
    s.talk(9_000, 12_500)
    s.tickTo(13_400)
    expect(s.of('backchannel.hum').map(h => h.hum)).toEqual(['sympathy', 'continuer', 'delight'])
  })
})
