import { describe, expect, it } from 'vitest'
import { fakeClock } from '../../clock'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import type { VoiceSnapshot } from '../../voiceSnapshot'
import { screenFeed } from '../screen'

function setup() {
  const patches: Partial<VoiceSnapshot>[] = []
  let chimes = 0
  const runtime = createVoiceRuntime({
    components: [], settings: VOICE_SETTINGS, clock: fakeClock(),
    adapters: [screenFeed({ set: p => patches.push(p), chime: () => { chimes++ } })],
  })
  runtime.start()
  const hand = (updateId: string, state: 'raised' | 'invited' | 'cleared') =>
    runtime.publish({ kind: 'orchestration.handRaise', updateId, state, critical: false, t: 0 })
  return { runtime, patches, chimes: () => chimes, hand }
}

describe('what the screen shows of orchestration', () => {
  it('chimes once and shows the badge while a hand is raised, until it is invited', () => {
    const s = setup()
    s.hand('u1', 'raised')
    expect(s.chimes()).toBe(1)
    expect(s.patches).toEqual([{ handRaise: { updateId: 'u1', critical: false } }])
    s.hand('u1', 'invited')
    expect(s.patches.at(-1)).toEqual({ handRaise: null })
  })

  it('says "Reconnecting…" while the speech connection is replaced', () => {
    const s = setup()
    s.runtime.publish({ kind: 'stt.status', state: 'reconnecting', t: 0 })
    s.runtime.publish({ kind: 'stt.status', state: 'open', t: 0 })
    expect(s.patches).toEqual([{ reconnecting: true }, { reconnecting: false }])
  })

  it('takes the badge down when voice stops', () => {
    const s = setup()
    s.hand('u1', 'raised')
    s.runtime.stop()
    expect(s.patches.at(-1)).toEqual({ handRaise: null })
  })
})
