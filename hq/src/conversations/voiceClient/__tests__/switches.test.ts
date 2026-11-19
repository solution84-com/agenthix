/**
 * The person's Hums and Expressive tone switches (Settings, under Adaptive voice), read as voice starts: Hums is the
 * backchannel's `on`, Expressive tone is tone's `on`. Not given, the session's own settings stand.
 */
import { describe, expect, it } from 'vitest'
import { VOICE_SETTINGS } from '../settings'
import { rig } from './sessionRig'

describe('Hums and Expressive tone @SC-2241', () => {
  it('are read as voice starts: the session runs on the person\'s values', async () => {
    const off = rig({ deps: { voiceHums: () => false, voiceExpressiveTone: () => false } })
    await off.start()
    expect(off.session.runtime()?.settings().backchannel.on).toBe(false)
    expect(off.session.runtime()?.settings().tone.on).toBe(false)
    const on = rig({ deps: { voiceHums: () => true, voiceExpressiveTone: () => true } })
    await on.start()
    expect(on.session.runtime()?.settings().backchannel.on).toBe(true)
    expect(on.session.runtime()?.settings().tone.on).toBe(true)
  })

  it('each stands alone: Hums off leaves tone on, and tone off leaves the hums on', async () => {
    const hums = rig({ deps: { voiceHums: () => false } })
    await hums.start()
    expect(hums.session.runtime()?.settings().tone.on).toBe(VOICE_SETTINGS.tone.on)
    const tone = rig({ deps: { voiceExpressiveTone: () => false } })
    await tone.start()
    expect(tone.session.runtime()?.settings().backchannel.on).toBe(VOICE_SETTINGS.backchannel.on)
  })

  it('are not changed when the session is not given them', async () => {
    const r = rig({})
    await r.start()
    expect(r.session.runtime()?.settings().backchannel.on).toBe(VOICE_SETTINGS.backchannel.on)
    expect(r.session.runtime()?.settings().tone.on).toBe(VOICE_SETTINGS.tone.on)
  })
})
