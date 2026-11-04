import { describe, expect, it } from 'vitest'
import { parseCommand } from '../commands'
import { managementLines } from '../consoleWords'
import { hqAddressWarning, hqMoved, movingLines } from '../hqAddressWords'

const flat = (text: string) => text.replace(/\s+/g, ' ')

describe("the commands for hq's address @SC-856", () => {
  it('reads hq address, site hq-address and console hq-address', () => {
    expect(parseCommand(['hq', 'address', 'http://192.168.1.30:4100', '--yes'])).toEqual({ kind: 'hqAddress', address: 'http://192.168.1.30:4100', yes: true })
    expect(parseCommand(['site', 'hq-address', 'https://hq.acme.example/'])).toEqual({ kind: 'siteHqAddress', address: 'https://hq.acme.example' })
    expect(parseCommand(['console', 'hq-address', 'https://hq.acme.example'])).toEqual({ kind: 'consoleHqAddress', address: 'https://hq.acme.example' })
  })

  it('refuses what is not one address', () => {
    expect(parseCommand(['site', 'hq-address'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['console', 'hq-address', 'hq.acme.example'])).toMatchObject({ kind: 'usage', message: expect.stringMatching(/http:\/\/ or https:\/\//) })
    expect(parseCommand(['hq', 'address', 'a', 'b'])).toMatchObject({ kind: 'usage' })
  })
})

describe('the warning before hq moves @SC-856', () => {
  it('says other machines will not follow a plain-http address on a public host, and not for one they follow', () => {
    expect(flat(hqAddressWarning('https://hq.acme.example', 'http://hq.acme.example:7800'))).toContain('will not follow HQ to http://hq.acme.example:7800')
    expect(hqAddressWarning('https://hq.acme.example', 'http://192.168.1.30:4100')).not.toContain('will not follow')
    expect(hqAddressWarning('http://192.168.1.30:4100', 'https://hq.acme.example')).not.toContain('will not follow')
  })
})

describe('what status says of a move that has not completed @SC-856', () => {
  it("says so for the machine, with the command for when it has", () => {
    const lines = managementLines({
      managedBy: {
        fingerprint: 'ab12', hqAddress: 'http://192.168.1.20:4100', local: false, connected: false, since: 'x',
        moving: { from: 'http://192.168.1.20:4100', to: 'http://192.168.1.30:4100', since: new Date(2026, 9, 14, 9, 12).toISOString(), problem: 'unreachable' },
      },
      consoleHere: null, retiredHere: null,
    }, false, true)
    const text = flat(lines.join('\n'))
    expect(text).toContain('Moving. HQ told this machine it is moving from http://192.168.1.20:4100 to http://192.168.1.30:4100.')
    expect(text).toContain('it has tried since 09:12')
    expect(text).toContain('agenthix console hq-address http://192.168.1.30:4100')
  })

  it('points an offline machine at the command when nothing told it', () => {
    const lines = managementLines({
      managedBy: { fingerprint: 'ab12', hqAddress: 'http://192.168.1.20:4100', local: false, connected: false, since: 'x', moving: null },
      consoleHere: null, retiredHere: null,
    }, false, true)
    expect(lines.join('\n')).toContain('agenthix console hq-address <address>')
  })

  it('says it of the site too', () => {
    expect(flat(movingLines('http://a.example', 'https://b.example', new Date(2026, 9, 14, 9, 12).toISOString(), 'site')))
      .toContain('The site keeps using the old address until the new one passes the check')
  })

  it('names who was told after a move, and what the others run', () => {
    const text = flat(hqMoved('https://hq.acme.example', { sites: { told: 2, of: 3 }, hosts: { told: 2, of: 3 }, console: true }))
    expect(text).toContain('2 of 3 sites and 2 of 3 host services were told')
    expect(text).toContain('agenthix console hq-address https://hq.acme.example agenthix site hq-address https://hq.acme.example')
  })
})
