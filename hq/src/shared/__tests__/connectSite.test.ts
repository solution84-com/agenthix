import { describe, it, expect } from 'vitest'
import { siteStatusMeaning, hqAddressProblem } from '../connectSite'

const RESTART_HINT =
  'The site service is not running. Runs will fail until it is. Start it with `docker compose -f site/compose.yml --env-file site/compose.env up -d site`, or `[dev] Start All` in development. It reconnects by itself.'

describe('siteStatusMeaning @SC-814', () => {
  it('says the default site is online and that agents run there', () => {
    expect(siteStatusMeaning({ status: 'ONLINE', isDefault: true })).toEqual({
      tone: 'ok',
      label: 'Online',
      what: 'Connected. Agents run here.',
    })
  })

  it.each(['OFFLINE', 'REGISTERED', 'REVOKED'])(
    'gives the default site the service-not-running sentence when it is %s',
    (status) => {
      expect(siteStatusMeaning({ status, isDefault: true })).toEqual({
        tone: 'off',
        label: 'Offline',
        what: RESTART_HINT,
      })
    },
  )

  it('reads a default site that needs upgrading like any other site, not as offline', () => {
    expect(siteStatusMeaning({ status: 'VERSION_MISMATCH', isDefault: true })).toEqual(
      siteStatusMeaning({ status: 'VERSION_MISMATCH', isDefault: false }),
    )
    expect(siteStatusMeaning({ status: 'VERSION_MISMATCH', isDefault: true })).toEqual({
      tone: 'wait',
      label: 'Needs upgrading',
      what: 'It runs a different protocol version than hq. Upgrade the site and it reconnects by itself.',
    })
  })

  it.each([
    ['ONLINE', 'ok', 'Online', 'Connected.'],
    [
      'REGISTERED',
      'wait',
      'Registered — not yet connected',
      'It has registered but has not connected. Check that its machine can reach hq\'s address and that the site is running.',
    ],
    ['OFFLINE', 'off', 'Offline', 'hq cannot reach it. Check the machine is on and the site is running.'],
    [
      'VERSION_MISMATCH',
      'wait',
      'Needs upgrading',
      'It runs a different protocol version than hq. Upgrade the site and it reconnects by itself.',
    ],
    ['REVOKED', 'off', 'Revoked', 'A fleet admin removed this site.'],
  ])('describes another site that is %s', (status, tone, label, what) => {
    expect(siteStatusMeaning({ status, isDefault: false })).toEqual({ tone, label, what })
  })

  it('shows an unknown status as it is, without inventing a meaning', () => {
    expect(siteStatusMeaning({ status: 'SOMETHING_NEW', isDefault: false })).toEqual({
      tone: 'wait',
      label: 'SOMETHING_NEW',
      what: '',
    })
  })
})

describe('hqAddressProblem', () => {
  it.each(['http://localhost:4101', 'http://127.0.0.1:4101', 'http://127.4.5.6', 'http://[::1]:4101', 'http://0.0.0.0:4101'])(
    'explains that other machines cannot reach %s',
    (url) => {
      const problem = hqAddressProblem(url)
      expect(problem).toContain(`Other machines can't reach hq at ${url}.`)
      expect(problem).toContain('set hq\'s address (`HQ_URL`)')
      expect(problem).toContain('then restart hq.')
    },
  )

  it('names both an IP address example and a domain example', () => {
    const problem = hqAddressProblem('http://localhost:4101')
    expect(problem).toContain('http://192.168.1.20:4101')
    expect(problem).toContain('https://hq.example.com')
  })

  it.each(['https://hq.example.com', 'http://192.168.1.20:4101', 'http://mac.local:4101', 'not a url', '', 'http://'])(
    'has nothing to say about %j',
    (url) => {
      expect(hqAddressProblem(url)).toBeNull()
    },
  )
})
