/**
 * The count of people who asked to sign in with Agenthix Cloud, and the offers a fleet admin has dismissed: both hq's,
 * read and written over the console link for the fleet admin signed in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudOfferName } from '@agenthix/core'
import { HqCallError } from '../hq/link'
import { SAM, startHarness, type Harness } from './harness'

let h: Harness
beforeEach(async () => { h = await startHarness() })
afterEach(async () => { await h.close(); vi.unstubAllEnvs() })

describe('what the platform shows of Agenthix Cloud @SC-1113', () => {
  it('reads how many people asked, for the fleet admin signed in', async () => {
    const auth = await h.signIn()
    h.link.handle('cloud.askCount', () => ({ count: 3 }))
    expect((await h.request('/api/cloud/asks', auth)).json).toEqual({ count: 3 })
    expect(h.link.callsOf('cloud.askCount')).toEqual([{ byUserId: SAM.id }])
  })

  it('needs a session', async () => {
    h.link.handle('cloud.askCount', () => ({ count: 3 }))
    expect((await h.request('/api/cloud/asks')).status).toBe(401)
  })

  it('an hq older than the count is said to be older', async () => {
    const auth = await h.signIn()
    expect((await h.request('/api/cloud/asks', auth)).status).toBe(501)
  })

  it('reads the offers dismissed and dismisses one, as the person signed in', async () => {
    const auth = await h.signIn()
    const dismissed: CloudOfferName[] = []
    h.link.handle('cloud.offers', () => ({ dismissed: [...dismissed] }))
    h.link.handle('cloud.dismissOffer', p => { dismissed.push(p.offer); return { dismissed: [...dismissed] } })
    expect((await h.request('/api/cloud/offers', auth)).json).toEqual({ dismissed: [] })
    const res = await h.request('/api/cloud/offers/backups/dismiss', { method: 'POST', body: {}, ...auth })
    expect(res.json).toEqual({ dismissed: ['backups'] })
    expect(h.link.callsOf('cloud.dismissOffer')).toEqual([{ byUserId: SAM.id, offer: 'backups' }])
  })

  it('refuses a name that is not an offer without asking hq', async () => {
    const auth = await h.signIn()
    const res = await h.request('/api/cloud/offers/upgrade/dismiss', { method: 'POST', body: {}, ...auth })
    expect(res.status).toBe(400)
    expect(h.link.callsOf('cloud.dismissOffer')).toEqual([])
  })

  it("hq's refusal is passed on", async () => {
    const auth = await h.signIn()
    h.link.handle('cloud.offers', () => { throw new HqCallError('not_allowed', 'Only a fleet admin sees this.') })
    const res = await h.request('/api/cloud/offers', auth)
    expect(res.status).toBe(403)
  })

  it('gives the screens Cloud\'s address for the links out', async () => {
    const auth = await h.signIn()
    h.link.handle('cloud.state', () => ({ connection: null, connecting: null, lastAttempt: null, runByCloud: false }))
    expect((await h.request('/api/cloud', auth)).json.cloudUrl).toBe('https://cloud.agenthix.com')
    vi.stubEnv('CLOUD_URL', 'http://cloud.example.com')
    expect((await h.request('/api/cloud', auth)).json).toMatchObject({ cloudUrl: null })
  })
})
