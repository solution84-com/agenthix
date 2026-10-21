import { describe, expect, it, vi } from 'vitest'
import { hqUrlProblem, pairedHqUrlProblem } from '../hqUrlPolicy'

describe('hqUrlProblem', () => {
  it.each([
    'https://hq.example.com',
    'http://localhost:4101',
    'http://127.0.0.1:4100',
    'http://[::1]:4100',
    'http://host.docker.internal:4100',
    'http://studio.local:4100',
    'http://10.0.0.5:4100',
    'http://172.20.1.1:4100',
    'http://192.168.1.20:4100',
  ])('allows %s', url => expect(hqUrlProblem(url)).toBeNull())

  it.each([
    'http://hq.example.com',
    'http://203.0.113.7:4100',
    'http://172.32.0.1',
  ])('refuses %s, saying why', url => expect(hqUrlProblem(url)).toMatch(/credential/))

  it('refuses something that is not a URL', () => expect(hqUrlProblem('hq.example.com')).toMatch(/not a URL/i))
  it('refuses another scheme', () => expect(hqUrlProblem('ftp://hq.example.com')).toMatch(/https:\/\//))
})

describe('pairedHqUrlProblem — the address given with the pairing secret', () => {
  const resolvesTo = (...addresses: string[]) => vi.fn(async () => addresses)
  const resolvesNothing = () => vi.fn(async (): Promise<string[]> => { throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) })

  it('allows a container name on the private network it resolves on', async () => {
    expect(await pairedHqUrlProblem('http://ns-hq-web:4100', resolvesTo('172.18.0.3'))).toBeNull()
  })

  it('allows a container name on a private IPv6 network', async () => {
    expect(await pairedHqUrlProblem('http://ns-hq-web:4100', resolvesTo('fd00:12::3'))).toBeNull()
  })

  it('allows what any address allows, without resolving it', async () => {
    const lookup = resolvesTo('203.0.113.7')
    expect(await pairedHqUrlProblem('https://hq.example.com', lookup)).toBeNull()
    expect(await pairedHqUrlProblem('http://10.0.0.5:4100', lookup)).toBeNull()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('refuses a container name that resolves to a public address', async () => {
    expect(await pairedHqUrlProblem('http://ns-hq-web:4100', resolvesTo('172.18.0.3', '203.0.113.7'))).toMatch(/203\.0\.113\.7/)
  })

  it('refuses a container name that does not resolve', async () => {
    expect(await pairedHqUrlProblem('http://ns-hq-web:4100', resolvesNothing())).toMatch(/does not resolve/)
  })

  it('refuses any other plain http name, even one that resolves privately', async () => {
    const lookup = resolvesTo('10.1.2.3')
    expect(await pairedHqUrlProblem('http://hq.example.com:4100', lookup)).toMatch(/credential/)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('refuses a name that is only digits, which is an address in another form', async () => {
    expect(await pairedHqUrlProblem('http://3405803783:4100', resolvesTo('10.0.0.1'))).toMatch(/credential/)
  })

  it('leaves registration as strict as before: a container name is still refused there', () => {
    expect(hqUrlProblem('http://ns-hq-web:4100')).toMatch(/credential/)
  })
})
