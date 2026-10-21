import fs from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { filesOriginFor } from '../address'
import { install } from '../install'

let m: FakeMachine | null = null
afterEach(() => m?.cleanup())

describe("uploaded files' own origin, set at install (spec §16) @SC-819", () => {
  it('is files.localhost on HQ’s port for a local address, and files.<host> for a domain', () => {
    expect(filesOriginFor('http://localhost:4100')).toBe('http://files.localhost:4100')
    expect(filesOriginFor('https://hq.acme.example')).toBe('https://files.hq.acme.example')
    expect(filesOriginFor('http://hq.acme.example:8080')).toBe('http://files.hq.acme.example:8080')
  })

  it('is none where HQ’s address can have no subdomain', () => {
    expect(filesOriginFor('http://192.168.1.20:4100')).toBeNull()
    expect(filesOriginFor('http://[fd00::20]:4100')).toBeNull()
    expect(filesOriginFor('http://hq-box:4100')).toBeNull()
    expect(filesOriginFor('http://hq-box.local:4100')).toBeNull()
  })

  it('reaches hq-server and hq-web as FILES_ORIGIN, empty where there is none', async () => {
    for (const [address, origin] of [['https://hq.acme.example', 'https://files.hq.acme.example'], ['http://192.168.1.20:4100', '']]) {
      m = fakeMachine()
      await install(m.ctx, address, () => {})
      const hq = JSON.parse(fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8'))
      expect(hq.services['hq-server'].environment.FILES_ORIGIN).toBe(origin)
      expect(hq.services['hq-web'].environment.FILES_ORIGIN).toBe(origin)
      m.cleanup()
      m = null
    }
  })
})
