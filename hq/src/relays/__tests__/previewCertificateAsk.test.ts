// @vitest-environment node
import { withFeature } from '@agenthix/core/testing'
import { describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import { DEV_PREVIEW_PATTERN, newAppId, previewPatternForDomain } from '@agenthix/core'
import { certificateAllowed, certificateAskHandler, previewPatternFromEnv, type CertificateAskDeps } from '../previewCertificateAsk'

const PATTERN = previewPatternForDomain('preview.acme.net')
const KNOWN = newAppId()
const deps = (over: Partial<CertificateAskDeps> = {}): CertificateAskDeps => ({
  pattern: () => PATTERN, appExists: async id => id === KNOWN, ...over,
})

withFeature('livePreview', () => {
describe("the front door's question before a live app's certificate @SC-1757", () => {
  it('allows a recorded app and the check name, under the pattern only', async () => {
    expect(await certificateAllowed(`p-${KNOWN}.preview.acme.net`, deps())).toBe(true)
    expect(await certificateAllowed('p-check.preview.acme.net', deps())).toBe(true)
    expect(await certificateAllowed(`P-${KNOWN.toUpperCase()}.Preview.Acme.Net`, deps())).toBe(true)
  })

  it('refuses names nobody recorded, other domains and anything that is not a name', async () => {
    expect(await certificateAllowed(`p-${newAppId()}.preview.acme.net`, deps())).toBe(false)
    expect(await certificateAllowed(`p-${KNOWN}.preview.acme.org`, deps())).toBe(false)
    expect(await certificateAllowed(`x.p-${KNOWN}.preview.acme.net`, deps())).toBe(false)
    expect(await certificateAllowed('preview.acme.net', deps())).toBe(false)
    expect(await certificateAllowed('p-web.preview.acme.net', deps())).toBe(false)
    expect(await certificateAllowed(`p-${KNOWN}.preview.acme.net:443`, deps())).toBe(false)
    expect(await certificateAllowed(['p-check.preview.acme.net'], deps())).toBe(false)
    expect(await certificateAllowed(undefined, deps())).toBe(false)
  })

  it('refuses everything with live apps off, or with a development pattern', async () => {
    expect(await certificateAllowed('p-check.preview.acme.net', deps({ pattern: () => null }))).toBe(false)
    expect(await certificateAllowed('p-check.preview.localhost', deps({ pattern: () => DEV_PREVIEW_PATTERN }))).toBe(false)
  })

  it('refuses when the records cannot be read', async () => {
    expect(await certificateAllowed(`p-${KNOWN}.preview.acme.net`, deps({ appExists: async () => { throw new Error('db down') } }))).toBe(false)
  })

  it('answers yes or no in its status, and nothing more', async () => {
    const answer = async (domain: unknown) => {
      const got: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} }
      const res = {
        setHeader: (k: string, v: string) => { got.headers[k] = v },
        status(n: number) { got.status = n; return this },
        type() { return this },
        send(b: unknown) { got.body = b; return this },
      } as unknown as Response
      await certificateAskHandler(deps())({ query: { domain } } as unknown as Request, res)
      return got
    }
    expect(await answer('p-check.preview.acme.net')).toMatchObject({ status: 200, body: 'yes', headers: { 'Cache-Control': 'no-store' } })
    expect(await answer('hq.acme.net')).toMatchObject({ status: 404, body: 'no' })
  })

  it('reads the pattern the host service sets, and nothing that is not one', () => {
    expect(previewPatternFromEnv({ PREVIEW_PATTERN: PATTERN })).toBe(PATTERN)
    expect(previewPatternFromEnv({ PREVIEW_PATTERN: '' })).toBeNull()
    expect(previewPatternFromEnv({ PREVIEW_PATTERN: 'https://preview.acme.net' })).toBeNull()
    expect(previewPatternFromEnv({})).toBeNull()
  })
})
})
