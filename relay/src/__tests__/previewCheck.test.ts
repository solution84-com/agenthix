import { afterEach, describe, expect, it } from 'vitest'
import { PREVIEW_CHECK_ANSWER, previewPatternForDomain } from '@agenthix/core'
import { ConfigError, loadConfig } from '../config'
import { ask, startRelay, type Harness } from '../test/harness'

const PATTERN = previewPatternForDomain('preview.example.net')
let relay: Harness | null = null
afterEach(async () => {
  await relay?.close()
  relay = null
})

describe("the relay's own answer on the preview check name @SC-1751", () => {
  it('answers p-check under the preview domain itself, sealed, without any site', async () => {
    relay = await startRelay({ previewPattern: PATTERN })
    const a = await ask(relay.port, '/', { host: 'p-check.preview.example.net' })
    expect(a.status).toBe(200)
    expect(a.body.toString()).toBe(PREVIEW_CHECK_ANSWER)
    expect(a.headers['content-security-policy']).toBe('sandbox')
    expect(a.headers['x-content-type-options']).toBe('nosniff')
    expect(a.headers['set-cookie']).toBeUndefined()
  })

  it('answers nothing but GET and HEAD there', async () => {
    relay = await startRelay({ previewPattern: PATTERN })
    expect((await ask(relay.port, '/', { host: 'p-check.preview.example.net', method: 'POST' })).status).toBe(405)
    const head = await ask(relay.port, '/', { host: 'p-check.preview.example.net', method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.body.length).toBe(0)
  })

  it('answers no check name with live apps off, or under another domain', async () => {
    relay = await startRelay()
    expect((await ask(relay.port, '/', { host: 'p-check.preview.example.net' })).body.toString()).not.toBe(PREVIEW_CHECK_ANSWER)
    await relay.close()
    relay = await startRelay({ previewPattern: PATTERN })
    expect((await ask(relay.port, '/', { host: 'p-check.preview.example.org' })).body.toString()).not.toBe(PREVIEW_CHECK_ANSWER)
    expect((await ask(relay.port, '/', { host: 'check.preview.example.net' })).body.toString()).not.toBe(PREVIEW_CHECK_ANSWER)
  })
})

describe('the preview pattern in the configuration @SC-1751', () => {
  const base = { RELAY_HQ_ADDRESS: 'http://hq-server:4101', HQ_RELAY_SECRET: 'x'.repeat(32) }

  it('is off unless set, and refused when it is not a pattern', () => {
    expect(loadConfig(base).previewPattern).toBeNull()
    expect(loadConfig({ ...base, PREVIEW_PATTERN: '' }).previewPattern).toBeNull()
    expect(loadConfig({ ...base, PREVIEW_PATTERN: PATTERN }).previewPattern).toBe(PATTERN)
    expect(() => loadConfig({ ...base, PREVIEW_PATTERN: 'https://preview.example.net' })).toThrow(ConfigError)
    expect(() => loadConfig({ ...base, PREVIEW_PATTERN: 'http://p-{id}.preview.example.net' })).toThrow(/PREVIEW_PATTERN/)
  })
})
