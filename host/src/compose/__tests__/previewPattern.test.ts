import { describe, expect, it } from 'vitest'
import { parsePreviewPattern } from '@agenthix/core'
import { previewPatternOf } from '../projects'

describe('the pattern live apps’ addresses are made from @SC-1756', () => {
  it('at an https address, is the preview domain’s, and empty until one is set', () => {
    expect(previewPatternOf({ address: 'https://hq.example.com', previewDomain: 'preview.acme.net' })).toBe('https://p-{id}.preview.acme.net')
    expect(previewPatternOf({ address: 'https://hq.example.com' })).toBe('')
  })

  it('at a loopback http address, is under preview.localhost on HQ’s own port, whatever domain is kept', () => {
    expect(previewPatternOf({ address: 'http://localhost:7800' })).toBe('http://p-{id}.preview.localhost:7800')
    expect(previewPatternOf({ address: 'http://localhost' })).toBe('http://p-{id}.preview.localhost')
    expect(previewPatternOf({ address: 'http://hq.localhost:7800', previewDomain: 'preview.acme.net' })).toBe('http://p-{id}.preview.localhost:7800')
    expect(previewPatternOf({ address: 'http://127.0.0.1:7800' })).toBe('http://p-{id}.preview.localhost:7800')
    expect(parsePreviewPattern(previewPatternOf({ address: 'http://localhost:7800' }))).not.toBeNull()
  })

  it('at a bare network address, is empty: live apps are off', () => {
    expect(previewPatternOf({ address: 'http://192.168.1.10:7800' })).toBe('')
    expect(previewPatternOf({ address: 'http://192.168.1.10:7800', previewDomain: 'preview.acme.net' })).toBe('')
    expect(previewPatternOf({ address: 'http://hq.example.com' })).toBe('')
  })
})
