// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { APP_RENEW_BEFORE_MS, postAppEntry, renewIn } from '../appFrame'
import { refusalCode, siteLoad, appLine } from '../livePreviewWords'

afterEach(() => vi.restoreAllMocks())

const entry = { action: 'https://p-1.preview.example.com/__relay/enter', field: 'ticket', ticket: 'tk', origin: 'https://p-1.preview.example.com', target: 'frame' as const, expiresAt: 0 }

describe('entering a live app @SC-1697', () => {
  it('posts the ticket in a form into the named frame, or a new tab, and leaves no form behind', () => {
    const sent: { target: string; rel: string; action: string }[] = []
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) { sent.push({ target: this.target, rel: this.rel, action: this.action }) })
    postAppEntry(entry, 'live-app-1')
    postAppEntry({ ...entry, target: 'tab' }, 'ignored')
    expect(sent).toEqual([
      { target: 'live-app-1', rel: 'noopener', action: entry.action },
      { target: '_blank', rel: 'noopener', action: entry.action },
    ])
    expect(document.querySelectorAll('form')).toHaveLength(0)
  })

  it('posts nowhere but an http or https address', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined)
    postAppEntry({ ...entry, action: 'javascript:alert(1)' }, 'f')
    postAppEntry({ ...entry, action: 'not a url' }, 'f')
    expect(submit).not.toHaveBeenCalled()
  })

  it('renews a little before the cookie runs out, never sooner than ten seconds', () => {
    expect(renewIn(1_000_000 + 15 * 60_000, 1_000_000)).toBe(15 * 60_000 - APP_RENEW_BEFORE_MS)
    expect(renewIn(1_000_000, 1_000_000)).toBe(10_000)
  })
})

describe('live preview words', () => {
  it('says where it runs and how full @SC-1696', () => {
    expect(siteLoad({ name: 'preview-box', open: 2, limit: 6 })).toBe('preview-box · 2 of 6 open')
    expect(siteLoad({ name: 'lab', open: 1, limit: null })).toBe('lab · 1 open')
  })
  it('reads the code HQ gave a refusal @SC-1696', () => {
    expect(refusalCode({ data: { code: 'noDelivery' } })).toBe('noDelivery')
    expect(refusalCode(new Error('x'))).toBeNull()
  })
  it('says why an app did not start @SC-1703', () => {
    expect(appLine({ state: 'failed', detail: 'port 5173 did not answer', folder: '', command: 'npm run dev' })).toBe('It did not start: port 5173 did not answer')
  })
})
