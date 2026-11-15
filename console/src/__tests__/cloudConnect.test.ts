/**
 * The organisation's connection to Agenthix Cloud on HQ's page: read from hq over the console link. Connecting and
 * disconnecting are done in hq, by an organisation admin, so the Fleet Console offers neither.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HqCloudState } from '@agenthix/core'
import { SAM, askAsShipped, startHarness, type Harness } from './harness'
import { withFeature } from '@agenthix/core/testing'

let h: Harness
beforeEach(async () => { h = await startHarness({ askFeatures: askAsShipped }) })
afterEach(async () => { await h.close() })

const CONNECTING = {
  userCode: 'WDJB-MJHT', verificationUri: 'https://cloud.agenthix.com/connect',
  verificationUriComplete: 'https://cloud.agenthix.com/connect?user_code=WDJB-MJHT', expiresAt: '2026-01-01T00:15:00.000Z',
}
const CONNECTED = { cloudOrganisationId: 'org_42', name: 'Acme Robotics', connectedAt: '2026-01-01T00:01:00.000Z' }

withFeature('cloud', () => {
  describe("the organisation's connection to Cloud @SC-1075", () => {
    it('reads hq\'s state: waiting on approval with the code to check, then connected', async () => {
      const auth = await h.signIn()
      let state: HqCloudState = { connection: null, connecting: CONNECTING, lastAttempt: null, runByCloud: false }
      h.link.handle('cloud.state', () => state)
      expect((await h.request('/api/cloud', auth)).json).toMatchObject({ organisation: null, connecting: CONNECTING })
      state = { connection: CONNECTED, connecting: null, lastAttempt: null, runByCloud: false }
      expect((await h.request('/api/cloud', auth)).json).toMatchObject({ organisation: CONNECTED, connecting: null })
      expect(h.link.callsOf('cloud.state')).toEqual([{ byUserId: SAM.id }, { byUserId: SAM.id }])
    })

    it('says whether Agenthix Cloud runs hq, which hq always says @SC-1123', async () => {
      const auth = await h.signIn()
      h.link.handle('cloud.state', () => ({ connection: CONNECTED, connecting: null, lastAttempt: null, runByCloud: true }))
      expect((await h.request('/api/cloud', auth)).json).toMatchObject({ organisation: CONNECTED, runByCloud: true })
      h.link.handle('cloud.state', () => ({ connection: CONNECTED, connecting: null, lastAttempt: null, runByCloud: false }))
      expect((await h.request('/api/cloud', auth)).json).toMatchObject({ runByCloud: false })
      h.link.handle('cloud.state', () => ({ connection: CONNECTED, connecting: null, lastAttempt: null }) as unknown as HqCloudState)
      expect((await h.request('/api/cloud', auth)).status).toBe(502)
    })

    it('passes on why hq\'s calls to Cloud are refused for the protocol, and none when there is none @SC-1169', async () => {
      const auth = await h.signIn()
      const problem = 'Agenthix Cloud speaks protocol 3.0 and this HQ speaks 1.0, too far apart to work together: upgrade this HQ.'
      h.link.handle('cloud.state', () => ({ connection: CONNECTED, connecting: null, lastAttempt: null, runByCloud: false, problem }))
      expect((await h.request('/api/cloud', auth)).json).toMatchObject({ organisation: CONNECTED, problem })
      h.link.handle('cloud.state', () => ({ connection: CONNECTED, connecting: null, lastAttempt: null, runByCloud: false }))
      expect((await h.request('/api/cloud', auth)).json).toMatchObject({ problem: null })
    })

    it('an hq older than the connection reads as not connected', async () => {
      const auth = await h.signIn()
      expect((await h.request('/api/cloud', auth)).json).toMatchObject({ organisation: null, connecting: null })
    })

    it('does not show an answer it does not understand', async () => {
      const auth = await h.signIn()
      h.link.handle('cloud.state', () => ({ connection: null, connecting: { ...CONNECTING, verificationUri: 'javascript:alert(1)' }, lastAttempt: null, runByCloud: false }))
      expect((await h.request('/api/cloud', auth)).status).toBe(502)
    })

    it('no longer offers connecting or disconnecting: hq does, for an organisation admin, and hq is never asked here @SC-1076', async () => {
      const auth = await h.signIn()
      expect((await h.request('/api/cloud/organisation', { method: 'POST', body: {}, ...auth })).status).toBe(404)
      expect((await h.request('/api/cloud/organisation', { method: 'DELETE', ...auth })).status).toBe(404)
      expect(h.link.wire()).not.toMatch(/cloud\.(connect|disconnect)/)
    })
  })
})
