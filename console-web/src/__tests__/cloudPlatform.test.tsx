import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudView } from '@agenthix/core'
import { App } from '../App'
import { FeaturesProvider } from '../features/features'
import { forgetCsrfToken } from '../api/csrf'
import { CloudOfferLine } from '../cloud/CloudOfferLine'
import { cloudLinkOut } from '../cloud/linkOut'
import { SAMPLE_HOSTS } from '../dev/fleetSamples'
import { bareAddress } from '../pages/hq/AddressPage'
import { fakeServer, SAM, STATUS_OK, type Route, featuresAsShipped } from './fakeServer'
import { withFeature } from '@agenthix/core/testing'

const ORG = { organisationName: 'Acme Robotics', address: 'https://hq.acme.example' }
const HQ_HOST = SAMPLE_HOSTS[0]
const CLOUD_URL = 'https://cloud.example'
const CONNECTED = { cloudOrganisationId: 'org_42', name: 'Acme Robotics', connectedAt: '2026-01-01T00:01:00.000Z' }

const view = (over: Partial<CloudView> = {}): CloudView =>
  ({ organisation: null, account: null, place: 'onTheMachine', connecting: null, lastAttempt: null, cloudUrl: CLOUD_URL, runByCloud: false, ...over })

const signedIn = (cloud: object, extra: Record<string, Route> = {}): Record<string, Route> => ({
  'GET /status': { status: 200, body: STATUS_OK },
  'GET /features': featuresAsShipped(),
  'GET /session': { status: 200, body: { user: SAM, account: { username: 'sam', organisationAdmin: true, since: null }, hq: ORG } },
  'GET /fleet': { status: 200, body: { console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'x', hq: 'connected' }, hq: ORG, hosts: [HQ_HOST], disconnected: [] } },
  [`GET /hosts/${HQ_HOST.fingerprint}`]: { status: 200, body: { host: HQ_HOST } },
  'GET /cloud': { status: 200, body: cloud },
  'GET /remote-access': { status: 200, body: { state: { on: false }, organisationConnected: false, place: 'onTheMachine' } },
  'GET /authenticator': { status: 200, body: { code: null, place: 'onTheMachine' } },
  'GET /fleet-admins': { status: 200, body: { admins: [] } },
  ...extra,
})

function openAt(path: string) {
  window.history.replaceState(null, '', path)
  sessionStorage.setItem('csrfToken', 'tok')
  render(<App />)
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear() })

describe('links out to Cloud @SC-1119', () => {
  it('carry exactly where to return to, the task and the entry point, and the return is a path only', () => {
    const href = cloudLinkOut(CLOUD_URL, { task: 'switch', from: 'fleet-console-menu' }, '/hq')!
    const url = new URL(href)
    expect(url.origin).toBe(CLOUD_URL)
    expect([...url.searchParams.keys()].sort()).toEqual(['from', 'return', 'task'])
    expect(url.searchParams.get('return')).toBe('/hq')
    expect(href).not.toMatch(/127\.0\.0\.1|localhost|Acme/)
  })

  it('are left out where Cloud\'s address is not known', () => {
    expect(cloudLinkOut(undefined, { task: 'connect', from: 'fleet-console-hq' }, '/hq')).toBeNull()
  })
})

withFeature('cloud', () => {
  describe("the Cloud section on HQ's page @SC-1115", () => {
    it('not connected: says what Cloud gives, the people who asked, and where to connect (HQ, not here)', async () => {
      fakeServer(signedIn(view(), { 'GET /cloud/asks': { status: 200, body: { count: 3 } } }))
      openAt('/hq')
      const section = await screen.findByRole('region', { name: 'Agenthix Cloud connection' })
      expect(await within(section).findByText(/asked to sign in with Agenthix Cloud/)).toBeTruthy()
      expect(within(section).getByText(/3 people/)).toBeTruthy()
      expect(within(section).getByText(/done in HQ by an organisation admin, under Manage › Providers/)).toBeTruthy()
      expect(within(section).queryByRole('button', { name: /Connect/ })).toBeNull()
      expect(section.textContent).not.toMatch(/cloud connect/)
    })

    it('leaves the people who asked out when nobody did', async () => {
      fakeServer(signedIn(view(), { 'GET /cloud/asks': { status: 200, body: { count: 0 } } }))
      openAt('/hq')
      const section = await screen.findByRole('region', { name: 'Agenthix Cloud connection' })
      await waitFor(() => expect(within(section).getByText(/done in HQ by an organisation admin/)).toBeTruthy())
      expect(section.textContent).not.toMatch(/asked to sign in/)
    })

    it('connected: shows the person\'s own Cloud account as not linked, and no Disconnect here', async () => {
      fakeServer(signedIn(view({ organisation: CONNECTED })))
      openAt('/hq')
      const section = await screen.findByRole('region', { name: 'Agenthix Cloud connection' })
      expect(within(section).getByText(/Not linked/)).toBeTruthy()
      expect(within(section).queryByRole('button', { name: 'Disconnect…' })).toBeNull()
    })

    it('HQ on Agenthix Cloud: the connection is Cloud\'s own, so there is no Disconnect', async () => {
      fakeServer(signedIn(view({ organisation: CONNECTED, runByCloud: true })))
      openAt('/hq')
      const section = await screen.findByRole('region', { name: 'Agenthix Cloud connection' })
      expect(within(section).getByText(/runs this HQ/)).toBeTruthy()
      expect(within(section).queryByRole('button', { name: 'Disconnect…' })).toBeNull()
      expect(within(section).getByRole('button', { name: 'Open Agenthix Cloud ↗' })).toBeTruthy()
    })

    it('HQ on Agenthix Cloud, not connected yet: no offer of Cloud, and it says to connect in HQ @SC-1124', async () => {
      fakeServer(signedIn(view({ runByCloud: true })))
      openAt('/hq')
      const section = await screen.findByRole('region', { name: 'Agenthix Cloud connection' })
      expect(within(section).getByText(/connects HQ as it sets it up/)).toBeTruthy()
      expect(within(section).getByText(/connect it in HQ/)).toBeTruthy()
      expect(within(section).queryByRole('button', { name: /Connect/ })).toBeNull()
    })
  })
})

withFeature('cloud', () => {
  describe('the organisation switcher in the menu head @SC-1116', () => {
    const open = async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Organisation: Acme Robotics/ }))
      return screen.getByRole('menu', { name: 'Organisations' })
    }

    it('not connected: lists only this organisation, says other ones need Agenthix Cloud, and points to HQ\'s page', async () => {
      fakeServer(signedIn(view()))
      openAt('/')
      const menu = await open()
      expect(within(menu).getAllByText('Acme Robotics')).toHaveLength(1)
      expect(within(menu).getByText(/Other organisations need/)).toBeTruthy()
      expect(within(menu).getByRole('link', { name: /HQ › Agenthix Cloud/ }).getAttribute('href')).toBe('/hq')
      const start = new URL(within(menu).getByRole('menuitem', { name: /Start your own organisation/ }).getAttribute('href')!)
      expect(start.searchParams.get('task')).toBe('start-organisation')
      expect(start.searchParams.get('from')).toBe('fleet-console-menu')
      expect([...start.searchParams.keys()]).toHaveLength(3)
    })

    it('connected and not linked: asks to link in Your account', async () => {
      fakeServer(signedIn(view({ organisation: CONNECTED })))
      openAt('/')
      const menu = await open()
      expect(within(menu).getByRole('link', { name: 'Link it in Your account' }).getAttribute('href')).toBe('/account')
      expect(within(menu).queryByRole('menuitem', { name: /Switch organisation/ })).toBeNull()
    })

    it('connected and linked: Switch organisation opens the person\'s switcher on Cloud', async () => {
      fakeServer(signedIn(view({ organisation: CONNECTED, account: { accountId: 'acc_1', linkedAt: '2026-01-02T00:00:00.000Z' } })))
      openAt('/')
      const menu = await open()
      const link = within(menu).getByRole('menuitem', { name: /Switch organisation/ })
      expect(new URL(link.getAttribute('href')!).searchParams.get('task')).toBe('switch')
    })
  })
})

withFeature('cloud', () => {
  describe('the offers where Cloud removes a limit @SC-1117', () => {
    it('shows one dismissible line, and dismissing it asks hq to keep that, for good', async () => {
      const requests = fakeServer({
        'GET /features': featuresAsShipped,
        'GET /cloud': { status: 200, body: view() },
        'GET /cloud/offers': { status: 200, body: { dismissed: ['address'] } },
        'POST /cloud/offers/backups/dismiss': { status: 200, body: { dismissed: ['address', 'backups'] } },
      })
      sessionStorage.setItem('csrfToken', 'tok')
      render(<FeaturesProvider><CloudOfferLine offer="backups" from="fleet-console-backups" /><CloudOfferLine offer="address" from="fleet-console-address" /></FeaturesProvider>)
      const line = await screen.findByRole('complementary', { name: 'Agenthix Cloud offer' })
      expect(within(line).getByText(/backups are kept away from the machine/)).toBeTruthy()
      expect(new URL(within(line).getByRole('link').getAttribute('href')!).searchParams.get('task')).toBe('offer-backups')
      fireEvent.click(within(line).getByRole('button', { name: 'Dismiss this offer' }))
      await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull())
      expect(requests.some(r => r.method === 'POST' && r.path === '/cloud/offers/backups/dismiss')).toBe(true)
    })

    it('shows nothing when hq cannot say what was dismissed', async () => {
      fakeServer({ 'GET /features': featuresAsShipped, 'GET /cloud': { status: 200, body: view() }, 'GET /cloud/offers': { status: 501, body: { error: 'hq_too_old', message: 'older' } } })
      sessionStorage.setItem('csrfToken', 'tok')
      render(<FeaturesProvider><CloudOfferLine offer="site" from="fleet-console-dashboard" /></FeaturesProvider>)
      await new Promise(r => setTimeout(r, 50))
      expect(screen.queryByRole('complementary')).toBeNull()
    })

    it('an address is bare when it is not https or is a network address', () => {
      expect(bareAddress('http://192.168.1.20:4100')).toBe(true)
      expect(bareAddress('https://10.0.0.5')).toBe(true)
      expect(bareAddress('https://hq.acme.example')).toBe(false)
      expect(bareAddress(null)).toBe(false)
    })
  })
})
