import { describe, expect, it } from 'vitest'
import { APP_ENTRY_PATH, DEV_PREVIEW_PATTERN } from '@agenthix/core'
import { judgeAppRequest, type RequestFacts } from '../apps/appRules'
import { devPreviewPattern, previewHostOf } from '../apps/previewHost'
import { loadConfig } from '../config'

const APP = 'https://p-abcdefghijklmnopqrstuvwxyz.preview.example.com'
const HQ = 'https://hq.example.com'
const facts = (over: Partial<RequestFacts>): RequestFacts => ({
  method: 'GET', path: '/', query: false, websocket: false, origin: undefined, site: 'same-origin', mode: 'cors', dest: 'empty', ...over,
})
const judge = (over: Partial<RequestFacts>) => judgeAppRequest(facts(over), APP, HQ)

describe('which requests to an app the relay lets through @SC-1750', () => {
  it('lets the app\'s own requests through, and nothing same-site or cross-site', () => {
    expect(judge({})).toEqual({ pass: 'request' })
    expect(judge({ site: 'same-site' })).toEqual({ refuse: 'cross-site' })
    expect(judge({ site: 'cross-site', mode: 'no-cors', dest: 'image' })).toEqual({ refuse: 'cross-site' })
  })

  it('fails closed without fetch metadata', () => {
    expect(judge({ site: undefined })).toEqual({ refuse: 'no-fetch-metadata' })
    expect(judge({ mode: undefined })).toEqual({ refuse: 'no-fetch-metadata' })
  })

  it('takes navigations of the app\'s own, and the person\'s own at the top level', () => {
    expect(judge({ mode: 'navigate', dest: 'iframe' })).toEqual({ pass: 'request' })
    expect(judge({ mode: 'navigate', dest: 'document', site: 'none' })).toEqual({ pass: 'request' })
    expect(judge({ mode: 'navigate', dest: 'iframe', site: 'none' })).toEqual({ refuse: 'navigation' })
    expect(judge({ mode: 'navigate', dest: 'document', site: 'none', method: 'POST' })).toEqual({ refuse: 'navigation' })
    // A link opened from a mail or chat program is a navigation from no page too: it lands on the app's `/` only.
    expect(judge({ mode: 'navigate', dest: 'document', site: 'none', path: '/admin/reset' })).toEqual({ toRoot: true })
    expect(judge({ mode: 'navigate', dest: 'document', site: 'none', query: true })).toEqual({ toRoot: true })
    expect(judge({ mode: 'navigate', dest: 'document', site: 'cross-site' })).toEqual({ refuse: 'navigation' })
  })

  it('takes a WebSocket only from the app\'s own page', () => {
    expect(judge({ websocket: true, origin: APP, mode: 'websocket' })).toEqual({ pass: 'request' })
    expect(judge({ websocket: true, origin: HQ, mode: 'websocket' })).toEqual({ refuse: 'websocket-origin' })
    expect(judge({ websocket: true, origin: APP, mode: 'websocket', site: 'same-site' })).toEqual({ refuse: 'websocket-origin' })
  })

  it('takes a WebSocket by its Origin alone when the browser sends no fetch metadata for it, as Chromium does not', () => {
    const bare = { websocket: true, site: undefined, mode: undefined, dest: undefined }
    expect(judge({ ...bare, origin: APP })).toEqual({ pass: 'request' })
    expect(judge({ ...bare, origin: HQ })).toEqual({ refuse: 'websocket-origin' })
    expect(judge({ ...bare, origin: undefined })).toEqual({ refuse: 'websocket-origin' })
    expect(judge({ ...bare, origin: 'null' })).toEqual({ refuse: 'websocket-origin' })
  })

  it('takes the entry only as a POST navigation from hq\'s page @SC-1749', () => {
    const entry = { path: APP_ENTRY_PATH, method: 'POST', origin: HQ, site: 'cross-site', mode: 'navigate', dest: 'iframe' }
    expect(judge(entry)).toEqual({ pass: 'entry' })
    expect(judge({ ...entry, origin: APP })).toEqual({ refuse: 'entry-origin' })
    expect(judge({ ...entry, method: 'GET' })).toEqual({ refuse: 'entry-origin' })
    expect(judge({ ...entry, mode: 'cors', dest: 'empty' })).toEqual({ refuse: 'navigation' })
    expect(judge({ ...entry, site: undefined })).toEqual({ refuse: 'no-fetch-metadata' })
    expect(judgeAppRequest(facts(entry), APP, null)).toEqual({ refuse: 'entry-origin' })
  })
})

describe('the preview pattern and hosts @SC-1751', () => {
  it('takes the pattern it is given, development\'s, or none', () => {
    expect(devPreviewPattern('http://localhost:4100')).toBe(DEV_PREVIEW_PATTERN)
    expect(devPreviewPattern('https://192.168.1.9')).toBeNull()
    expect(devPreviewPattern(undefined)).toBeNull()
  })

  it('refuses to start with a pattern it cannot read', () => {
    const base = { RELAY_HQ_ADDRESS: 'http://hq-server:4101', HQ_RELAY_SECRET: 'x'.repeat(32) }
    expect(() => loadConfig({ ...base, PREVIEW_PATTERN: 'https://example.com' })).toThrow(/PREVIEW_PATTERN.*Nothing was started/)
    expect(loadConfig({ ...base, PREVIEW_PATTERN: 'https://p-{id}.preview.example.com' }).previewPattern).toBe('https://p-{id}.preview.example.com')
  })

  it('reads the app from the host, its check name, and a name under the domain that is no app\'s', () => {
    const p = 'https://p-{id}.preview.example.com'
    expect(previewHostOf(p, 'p-abcdefghijklmnopqrstuvwxyz.preview.example.com')).toEqual({ app: 'abcdefghijklmnopqrstuvwxyz' })
    expect(previewHostOf(p, 'P-ABCDEFGHIJKLMNOPQRSTUVWXYZ.preview.example.com')).toEqual({ app: 'abcdefghijklmnopqrstuvwxyz' })
    expect(previewHostOf(p, 'p-check.preview.example.com')).toEqual({ check: true })
    expect(previewHostOf(p, 'p-short.preview.example.com')).toEqual({ unknown: true })
    expect(previewHostOf(p, 'hq.example.com')).toBeNull()
    expect(previewHostOf(null, 'p-abcdefghijklmnopqrstuvwxyz.preview.example.com')).toBeNull()
  })
})
