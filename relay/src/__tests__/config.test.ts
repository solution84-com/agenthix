import { describe, expect, it } from 'vitest'
import { DEV_PREVIEW_PATTERN, SERVICE_PORTS } from '@agenthix/core'
import { ConfigError, loadConfig } from '../config'
import { filesHostOf, isFilesHost } from '../filesHost'

const SECRET = 'x'.repeat(32)
const base = { RELAY_HQ_ADDRESS: 'http://hq-server:4101', HQ_RELAY_SECRET: SECRET }

describe('the relay\'s configuration @SC-1468', () => {
  it('refuses to start without hq\'s address or the secret, in plain words', () => {
    expect(() => loadConfig({ HQ_RELAY_SECRET: SECRET })).toThrow(/RELAY_HQ_ADDRESS is not set.*Nothing was started/)
    expect(() => loadConfig({ RELAY_HQ_ADDRESS: 'https://hq.example.com' })).toThrow(/HQ_RELAY_SECRET is not set/)
    expect(() => loadConfig({ ...base, HQ_RELAY_SECRET: 'short' })).toThrow(ConfigError)
  })

  it('refuses to send its secret in the clear across a network it does not control', () => {
    expect(() => loadConfig({ ...base, RELAY_HQ_ADDRESS: 'http://hq.example.com' })).toThrow(/unencrypted/)
    expect(() => loadConfig({ ...base, RELAY_HQ_ADDRESS: 'ftp://hq' })).toThrow(/https/)
    for (const ok of ['https://hq.example.com', 'http://localhost:4101', 'http://192.168.1.4:4101', 'http://hq-server:4101']) {
      expect(loadConfig({ ...base, RELAY_HQ_ADDRESS: ok }).hqAddress).toBe(ok)
    }
  })

  it('listens on the loopback and the relay\'s port by default', () => {
    const c = loadConfig(base)
    expect(c).toMatchObject({ listenHost: '127.0.0.1', port: SERVICE_PORTS.relay.server })
    expect(loadConfig({ ...base, RELAY_PORT: '5000', RELAY_LISTEN_HOST: '0.0.0.0' })).toMatchObject({ port: 5000, listenHost: '0.0.0.0' })
    expect(() => loadConfig({ ...base, RELAY_PORT: 'eighty' })).toThrow(/not a port/)
  })

  it('takes the app\'s origin from HQ_URL and the files host as hq-web decides it', () => {
    const c = loadConfig({ ...base, HQ_URL: 'https://hq.example.com/', FILES_ORIGIN: 'https://files.example.com' })
    expect(c).toMatchObject({ appOrigin: 'https://hq.example.com', filesHost: 'files.example.com' })
    expect(loadConfig({ ...base, HQ_URL: 'http://localhost:4100' }).filesHost).toBe('files.localhost')
    expect(loadConfig({ ...base, HQ_URL: 'https://hq.example.com' }).filesHost).toBeNull()
    expect(() => loadConfig({ ...base, FILES_ORIGIN: 'https://files.example.com/path' })).toThrow(/FILES_ORIGIN/)
  })

  it('takes live apps\' pattern from PREVIEW_PATTERN, defaults it only for hq on localhost, and refuses one that is not @SC-1751', () => {
    expect(loadConfig({ ...base, HQ_URL: 'https://hq.example.com', PREVIEW_PATTERN: 'https://p-{id}.preview.example.com' }).previewPattern)
      .toBe('https://p-{id}.preview.example.com')
    expect(loadConfig({ ...base, HQ_URL: 'http://localhost:4100' }).previewPattern).toBe(DEV_PREVIEW_PATTERN)
    expect(loadConfig({ ...base, HQ_URL: 'https://hq.example.com' }).previewPattern).toBeNull()
    expect(loadConfig({ ...base, HQ_URL: 'http://192.168.1.4:4100' }).previewPattern).toBeNull()
    expect(() => loadConfig({ ...base, PREVIEW_PATTERN: 'http://p-{id}.preview.example.com' })).toThrow(/PREVIEW_PATTERN/)
  })
})

describe('the files host @SC-1469', () => {
  it('is never hq\'s own host', () => {
    expect(filesHostOf('https://hq.example.com', 'https://hq.example.com')).toBeNull()
    expect(filesHostOf(undefined, 'http://192.168.1.4:4100')).toBeNull()
  })

  it('matches the Host header by name, ignoring the port and letter case', () => {
    expect(isFilesHost('FILES.localhost:4100', 'files.localhost')).toBe(true)
    expect(isFilesHost('localhost:4100', 'files.localhost')).toBe(false)
    expect(isFilesHost('files.localhost.evil.com', 'files.localhost')).toBe(false)
    expect(isFilesHost(undefined, 'files.localhost')).toBe(false)
    expect(isFilesHost('files.localhost', null)).toBe(false)
  })
})
