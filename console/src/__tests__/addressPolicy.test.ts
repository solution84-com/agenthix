import { describe, expect, it } from 'vitest'
import { hqAddressProblem, consoleLinkUrl } from '../hq/addressPolicy'

describe("hq's address @SC-890", () => {
  it('accepts https, and plain http on the machine or a private network', async () => {
    for (const a of ['https://hq.example.com', 'http://127.0.0.1:4100', 'http://localhost:4100', 'http://192.168.1.4', 'http://10.1.2.3']) {
      expect(await hqAddressProblem(a, { onHqMachine: false })).toBeNull()
    }
  })

  it('refuses plain http to anywhere else', async () => {
    expect(await hqAddressProblem('http://hq.example.com', { onHqMachine: false })).toMatch(/unencrypted/)
    expect(await hqAddressProblem('ftp://hq.example.com', { onHqMachine: false })).toMatch(/https/)
  })

  it("allows a container's name on hq's machine only when it resolves to private addresses", async () => {
    const privateName = { onHqMachine: true, resolve: async () => ['172.18.0.3'] }
    expect(await hqAddressProblem('http://hq-server:3001', privateName)).toBeNull()
    expect(await hqAddressProblem('http://hq-server:3001', { onHqMachine: false, resolve: privateName.resolve })).toMatch(/unencrypted/)
    expect(await hqAddressProblem('http://hq-server:3001', { onHqMachine: true, resolve: async () => ['8.8.8.8'] })).toMatch(/unencrypted/)
  })

  it('is dialled at /console-link, over wss for https', () => {
    expect(consoleLinkUrl('https://hq.example.com/some/path?x=1')).toBe('wss://hq.example.com/console-link')
    expect(consoleLinkUrl('http://127.0.0.1:4100')).toBe('ws://127.0.0.1:4100/console-link')
  })
})
