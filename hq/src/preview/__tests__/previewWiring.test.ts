// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { previewDomain, previewIdFromHost, previewOrigin } from '../previewWiring'

describe('previewDomain (adr-0071)', () => {
  it('uses the setting when there is one', () => {
    expect(previewDomain({ PREVIEW_DOMAIN: ' Preview.Example.com. ', NODE_ENV: 'production' })).toBe('preview.example.com')
  })

  it('needs no setting on a developer machine', () => {
    expect(previewDomain({ NODE_ENV: 'development' })).toBe('preview.localhost')
    expect(previewDomain({})).toBe('preview.localhost')
  })

  it('is off on a deployed install that sets none', () => {
    expect(previewDomain({ NODE_ENV: 'production' })).toBeNull()
    expect(previewDomain({ NODE_ENV: 'production', PREVIEW_DOMAIN: '  ' })).toBeNull()
  })
})

describe('previewIdFromHost', () => {
  const d = 'preview.example.com'

  it('reads the id from a preview host, with or without a port', () => {
    expect(previewIdFromHost('p-abc123.preview.example.com', d)).toBe('abc123')
    expect(previewIdFromHost('P-ABC123.Preview.Example.com:8443', d)).toBe('abc123')
  })

  it('is not a preview host otherwise', () => {
    expect(previewIdFromHost('hq.example.com', d)).toBeNull()
    expect(previewIdFromHost('preview.example.com', d)).toBeNull()
    expect(previewIdFromHost('x.p-abc.preview.example.com', d)).toBeNull()
    expect(previewIdFromHost('p-abc.preview.example.com.evil.test', d)).toBeNull()
    expect(previewIdFromHost('p-a_b.preview.example.com', d)).toBeNull()
    expect(previewIdFromHost(undefined, d)).toBeNull()
  })

  it('is never a preview host when previews are off', () => {
    expect(previewIdFromHost('p-abc.preview.localhost', null)).toBeNull()
  })
})

describe('previewOrigin', () => {
  it("takes hq's scheme and port", () => {
    expect(previewOrigin('abc', 'preview.localhost', 'http://localhost:4101')).toBe('http://p-abc.preview.localhost:4101')
    expect(previewOrigin('abc', 'preview.example.com', 'https://hq.example.com')).toBe('https://p-abc.preview.example.com')
  })
})
