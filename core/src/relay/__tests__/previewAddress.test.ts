import { describe, expect, it } from 'vitest'
import {
  APP_ID_LENGTH, DEV_PREVIEW_PATTERN, PREVIEW_CHECK_ID, appIdFromHost, isAppId, newAppId, parsePreviewPattern, previewOrigin,
  previewPatternForDomain,
} from '../previewAddress.js'

const ID = 'abcdefghijklmnopqrstuvwxyz'
const SELF = previewPatternForDomain('preview.example.com')

describe('an app\'s id @SC-1707', () => {
  it('is 26 lower-case base32 characters, 130 random bits, never repeated', () => {
    const ids = new Set(Array.from({ length: 200 }, newAppId))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(isAppId(id)).toBe(true)
    expect(APP_ID_LENGTH * 5).toBeGreaterThanOrEqual(128)
  })

  it('is never a name or a mixed-case id', () => {
    for (const v of ['fleet-console', ID.toUpperCase(), `${ID}a`, ID.slice(1), 'check', 12]) expect(isAppId(v)).toBe(false)
  })
})

describe('preview patterns @SC-1707', () => {
  it('builds an app\'s origin from a self-hosted domain, a hosted pattern and development alike (P9)', () => {
    expect(previewOrigin(SELF, ID)).toBe(`https://p-${ID}.preview.example.com`)
    expect(previewOrigin('https://{id}-apps.cloud.example.net', ID)).toBe(`https://${ID}-apps.cloud.example.net`)
    expect(previewOrigin(DEV_PREVIEW_PATTERN, ID)).toMatch(new RegExp(`^http://p-${ID}\\.preview\\.localhost:\\d+$`))
  })

  it('refuses a pattern that varies more than the first label, or is not an origin', () => {
    for (const p of [
      'https://preview.example.com', 'https://p-{id}.{id}.example.com', 'https://a.p-{id}.example.com',
      'https://p-{id}{id}.example.com', 'https://p-{id}.com', 'https://p-{id}.example.com/path', 'ftp://p-{id}.example.com',
      'http://p-{id}.example.com', 'https://p-{id}.10.0.0.1', 'https://p_{id}.example.com', 'https://p-{id}.example.com:0',
      'https://p-{id}.Example.com',
    ]) expect(parsePreviewPattern(p), p).toBeNull()
  })

  it('reads the app\'s id back from the host a browser asked for, and nothing else', () => {
    expect(appIdFromHost(SELF, `p-${ID}.preview.example.com`)).toBe(ID)
    expect(appIdFromHost(SELF, `P-${ID.toUpperCase()}.PREVIEW.example.com:443`)).toBe(ID)
    expect(appIdFromHost(SELF, `p-check.preview.example.com`)).toBe(PREVIEW_CHECK_ID)
    for (const host of [
      `p-${ID}.preview.example.com:8443`, `p-${ID}.other.example.com`, `x.p-${ID}.preview.example.com`,
      `p-fleet-console.preview.example.com`, `preview.example.com`, `q-${ID}.preview.example.com`,
    ]) expect(appIdFromHost(SELF, host), host).toBeNull()
    expect(appIdFromHost(DEV_PREVIEW_PATTERN, `p-${ID}.preview.localhost`)).toBeNull()
  })
})
