/** Opening a live app: hq's checks first, then the site's own ticket, then the app ticket, posted by a form. */
import { describe, it, expect, vi } from 'vitest'
import { APP_ENTRY_FIELD, APP_ENTRY_PATH, type LivePreviewActResult } from '@agenthix/core'

vi.mock('wasp/server', () => ({ HttpError: class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message) } } }))
vi.mock('../../server/siteConfig', () => ({ getSiteClientUrl: () => 'https://hq.example.com' }))

import { openLiveApp, type AppEntryDeps } from '../appEntry'

const APP = 'abcdefghijklmnopqrstuvwxyz'
const ORIGIN = `https://p-${APP}.preview.example.com`

function deps(over: Partial<AppEntryDeps> = {}, answer: LivePreviewActResult = { ok: true, outcome: { kind: 'app.open', ticket: { ticket: 'st-1', expiresAt: '' } } }) {
  const issued: unknown[] = []
  const asked: unknown[] = []
  const d: AppEntryDeps = {
    livePreview: async (_u, id) => ({ id, state: 'RUNNING', workspaceId: 'ws-1', executionSiteId: 'es-1' }),
    appInLivePreview: async () => true,
    appAddress: () => ORIGIN,
    siteAndRelay: async () => ({ siteId: 'site-1', label: 'preview-box', relayId: 'relay-1', relayConnected: true }),
    askSite: async (_s, params) => { asked.push(params); return answer },
    issue: async input => { issued.push(input); return { token: 'signed', expiresAt: 123, jti: 'j', enterBy: 1 } },
    ...over,
  }
  return { d, issued, asked }
}

describe('opening a live app @SC-1705', () => {
  it("asks the site for its own ticket, signs the app ticket with it, and answers the form for the app's address", async () => {
    const { d, issued, asked } = deps()
    const form = await openLiveApp('mia', { livePreviewId: 'lp1', appId: APP, entry: 'frame' }, d)
    expect(form).toEqual({ action: `${ORIGIN}${APP_ENTRY_PATH}`, field: APP_ENTRY_FIELD, ticket: 'signed', origin: ORIGIN, target: 'frame', expiresAt: 123 })
    expect(asked).toEqual([{ livePreviewId: 'lp1', personId: 'mia', request: { kind: 'app.open', appId: APP, entry: 'frame' } }])
    expect(issued).toEqual([{
      site: 'site-1', relay: 'relay-1', person: 'mia', livePreviewId: 'lp1', workspaceId: 'ws-1', appId: APP, entry: 'frame', cookie: 'frame', siteTicket: 'st-1',
    }])
  })

  it('renews the cookie a renewal names, and refuses one that names none', async () => {
    const { d } = deps()
    expect((await openLiveApp('mia', { livePreviewId: 'lp1', appId: APP, entry: 'renew', cookie: 'tab' }, d)).target).toBe('tab')
    await expect(openLiveApp('mia', { livePreviewId: 'lp1', appId: APP, entry: 'renew' }, d)).rejects.toThrow(/which way/)
  })

  it('refuses before asking the site: not an app, not running, no address, no relay', async () => {
    const { d, asked } = deps()
    await expect(openLiveApp('mia', { livePreviewId: 'lp1', appId: 'web', entry: 'frame' }, d)).rejects.toThrow(/Nothing was changed/)
    await expect(openLiveApp('mia', { livePreviewId: 'lp1', appId: APP, entry: 'frame' }, { ...d, appInLivePreview: async () => false })).rejects.toThrow(/not one of/)
    await expect(openLiveApp('mia', { livePreviewId: 'lp1', appId: APP, entry: 'frame' }, {
      ...d, livePreview: async id => ({ id, state: 'STOPPED', workspaceId: 'ws-1', executionSiteId: 'es-1' }),
    })).rejects.toThrow(/isn't running/)
    await expect(openLiveApp('mia', { livePreviewId: 'lp1', appId: APP, entry: 'frame' }, { ...d, appAddress: () => null })).rejects.toThrow(/need a domain/)
    await expect(openLiveApp('mia', { livePreviewId: 'lp1', appId: APP, entry: 'frame' }, {
      ...d, siteAndRelay: async () => ({ siteId: 'site-1', label: 'preview-box', relayId: 'relay-1', relayConnected: false }),
    })).rejects.toThrow(/relay that carries preview-box/)
    expect(asked).toEqual([])
  })

  it("signs nothing when the site refuses or gives no ticket", async () => {
    const refused = deps({}, { ok: false, refusal: { code: 'appNotRunning', message: 'm' } })
    await expect(openLiveApp('mia', { livePreviewId: 'lp1', appId: APP, entry: 'frame' }, refused.d)).rejects.toThrow(/not running on preview-box/)
    expect(refused.issued).toEqual([])
    const odd = deps({}, { ok: true, outcome: { kind: 'service.start', accepted: true } })
    await expect(openLiveApp('mia', { livePreviewId: 'lp1', appId: APP, entry: 'frame' }, odd.d)).rejects.toThrow(/could not read/)
    expect(odd.issued).toEqual([])
  })
})
