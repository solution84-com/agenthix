import { describe, expect, it } from 'vitest'
import { consoleInstallWarning } from '../consoleWords'

describe('the words before the Fleet Console is started here name its own port @SC-1254', () => {
  const flat = (t: string) => t.replace(/\s+/g, ' ')

  it('names the port asked for', () => {
    expect(flat(consoleInstallWarning('hq-box', 7700))).toContain('127.0.0.1:7700 of this machine only')
  })

  it('names the default port when none was asked for or recorded', () => {
    const said = flat(consoleInstallWarning('hq-box'))
    expect(said).toContain('127.0.0.1:7801 of this machine only')
    expect(said).not.toContain('4300')
  })
})
