/** Where uploaded files are served from, by HQ's address (host-management spec §16). */
import { describe, it, expect } from 'vitest'
import { filesPlace, isFilesHost } from '../filesOrigin'

const env = (vars: Record<string, string> = {}) => vars as NodeJS.ProcessEnv

describe('the files origin', () => {
  it('is FILES_ORIGIN when it is set', () => {
    expect(filesPlace(env({ FILES_ORIGIN: 'https://files.hq.acme.example' }), 'https://hq.acme.example'))
      .toEqual({ mode: 'origin', origin: 'https://files.hq.acme.example', host: 'files.hq.acme.example' })
  })

  it('on localhost, is files.localhost on the same scheme and port, with nothing set', () => {
    expect(filesPlace(env(), 'http://localhost:4100'))
      .toEqual({ mode: 'origin', origin: 'http://files.localhost:4100', host: 'files.localhost' })
  })

  it('on a bare network address, there is none: downloads only from HQ', () => {
    expect(filesPlace(env(), 'http://192.168.1.20:4100'))
      .toEqual({ mode: 'downloadsOnly', reason: 'bareAddress', origin: 'http://192.168.1.20:4100' })
    expect(filesPlace(env(), 'http://[fd00::20]:4100')).toMatchObject({ mode: 'downloadsOnly', reason: 'bareAddress' })
    expect(filesPlace(env(), 'http://hq-box:4100')).toMatchObject({ mode: 'downloadsOnly', reason: 'bareAddress' })
    expect(filesPlace(env(), 'http://hq-box.local:4100')).toMatchObject({ mode: 'downloadsOnly', reason: 'bareAddress' })
  })

  it('with a domain and none set, there is none either', () => {
    expect(filesPlace(env(), 'https://hq.acme.example')).toMatchObject({ mode: 'downloadsOnly', reason: 'notSet' })
  })

  it("is never HQ's own host, nor something that is not an origin", () => {
    expect(filesPlace(env({ FILES_ORIGIN: 'https://hq.acme.example:8443' }), 'https://hq.acme.example').mode).toBe('downloadsOnly')
    expect(filesPlace(env({ FILES_ORIGIN: 'https://files.acme.example/path' }), 'https://hq.acme.example').mode).toBe('downloadsOnly')
  })

  it('is told apart by the Host header, whatever its port or case', () => {
    const place = filesPlace(env(), 'http://localhost:4100')
    expect(isFilesHost('files.localhost:4100', place)).toBe(true)
    expect(isFilesHost('FILES.localhost', place)).toBe(true)
    expect(isFilesHost('localhost:4100', place)).toBe(false)
    expect(isFilesHost(undefined, place)).toBe(false)
  })
})
