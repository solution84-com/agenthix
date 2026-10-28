import { describe, it, expect } from 'vitest'
import { ON_BY_DEFAULT_WARNING, settingsData } from '../settings'

describe('the organisation\'s skill settings as a change', () => {
  it('maps each setting to its column', () => {
    expect(settingsData({ unsignedAssets: 'never', outsideInstallers: 'ADMINS_AND_MAINTAINERS', fileSkillsDefault: 'NEVER', personalSkillsOutsideSpace: false }, 'OFF'))
      .toEqual({ ok: true, data: { unsignedAssetsAllowed: false, outsideInstallers: 'ADMINS_AND_MAINTAINERS', fileSkillsDefault: 'NEVER', personalSkillsOutsideSpace: false } })
    expect(settingsData({}, 'OFF')).toEqual({ ok: true, data: {} })
  })

  it('chooses On by default only once its warning is confirmed (H4)', () => {
    const refused = settingsData({ fileSkillsDefault: 'ON' }, 'OFF')
    expect(refused).toMatchObject({ ok: false })
    expect(refused.ok ? '' : refused.message).toContain(ON_BY_DEFAULT_WARNING)
    expect(settingsData({ fileSkillsDefault: 'ON', confirmUnreviewed: true }, 'OFF')).toEqual({ ok: true, data: { fileSkillsDefault: 'ON' } })
    expect(settingsData({ fileSkillsDefault: 'ON' }, 'ON')).toEqual({ ok: true, data: { fileSkillsDefault: 'ON' } })
  })

  it('refuses a value that is none of the choices', () => {
    expect(settingsData({ unsignedAssets: true }, 'OFF').ok).toBe(false)
    expect(settingsData({ outsideInstallers: 'EVERYONE' }, 'OFF').ok).toBe(false)
    expect(settingsData({ fileSkillsDefault: 'off' }, 'OFF').ok).toBe(false)
    expect(settingsData({ personalSkillsOutsideSpace: 'yes' }, 'OFF').ok).toBe(false)
  })
})
