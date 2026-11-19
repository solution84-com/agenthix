/** The Log and the server's trace say when a hum was a reaction's: due on less speech, or held over a plainer answer. */
import { describe, expect, it } from 'vitest'
import type { VoiceEvent } from '../../events'
import { createTrailReader, emptyTrail } from '../pageTrail'
import { backchannelSteps } from '../otherSteps'
import { createTraceReader } from '../trace'

const T0 = 1_700_000_000_000
let seq = 0
const ev = (t: number, body: Record<string, unknown>) => ({ t, seq: seq++, ...body }) as unknown as VoiceEvent

const due = ev(5_500, {
  kind: 'backchannel.hum', pausedMs: 500, verdict: 'UNCERTAIN', speechMs: 1_500, hum: 'sympathy', tone: 'gentle',
  from: { call: 2, at: 3_000, ms: 450 }, reactionSpacing: true, reactionHeld: true,
})

describe('a reaction hum in the Log @SC-2228', () => {
  it('says the reaction spacing and the reaction hold on its row', () => {
    const trail = emptyTrail()
    const reader = createTrailReader(trail, () => T0)
    for (const e of [due, ev(5_505, { kind: 'backchannel.played', text: 'Aw.', hum: 'sympathy', tone: 'gentle', take: 1 })]) reader(e)
    const hum = backchannelSteps(trail).find(s => s.tag === 'hum')!
    expect(hum.detail).toContain('2 s of your speech since the agent\'s last sound, enough for a reaction')
    expect(hum.detail).toMatch(/the reaction held over a plainer answer since$/)
  })

  it('says both in the trace', () => {
    const t = createTraceReader()
    t(ev(0, { kind: 'clock.tick' }))
    expect(t(due)).toBe('5.5s backchannel: a sympathy gentle hum is due (paused 0.5 s, UNCERTAIN, 1.5 s of speech, enough for a reaction; the reaction held over a plainer answer)')
  })
})
