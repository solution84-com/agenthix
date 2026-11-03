import { describe, expect, it } from 'vitest'
import { appIdFromHost, newAppId, parsePreviewPattern, previewOrigin, previewPatternForLoopback } from '../previewAddress.js'

describe('live apps on an install at http://localhost (D58) @SC-1707', () => {
  it('are under preview.localhost on HQ\'s own port', () => {
    expect(previewPatternForLoopback(7800)).toBe('http://p-{id}.preview.localhost:7800')
    expect(parsePreviewPattern(previewPatternForLoopback(7800))).toEqual({ scheme: 'http', prefix: 'p-', suffix: '', domain: 'preview.localhost', port: 7800 })
    expect(previewPatternForLoopback(80)).toBe('http://p-{id}.preview.localhost')
  })

  it('read an app\'s id back from a host with the port, and only that port', () => {
    const pattern = previewPatternForLoopback(7800)!
    const id = newAppId()
    expect(previewOrigin(pattern, id)).toBe(`http://p-${id}.preview.localhost:7800`)
    expect(appIdFromHost(pattern, `p-${id}.preview.localhost:7800`)).toBe(id)
    expect(appIdFromHost(pattern, `p-${id}.preview.localhost:4401`)).toBeNull()
    expect(appIdFromHost(pattern, `p-${id}.preview.localhost`)).toBeNull()
  })

  it('refuses a port that is not one', () => {
    for (const bad of [0, 65536, 1.5, Number.NaN]) expect(previewPatternForLoopback(bad), String(bad)).toBeNull()
  })
})
