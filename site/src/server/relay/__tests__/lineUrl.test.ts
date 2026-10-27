import { describe, it, expect } from 'vitest'
import { resolveLineUrl } from '../lineUrl'

const HQ = 'wss://hq.example.com/hq-channel'

describe('resolveLineUrl @SC-1500', () => {
  it('resolves a path against the address the site dials hq on', () => {
    expect(resolveLineUrl('/relay-line', HQ)).toBe('wss://hq.example.com/relay-line')
    expect(resolveLineUrl('/relay-line', 'ws://hq-web:80/hq-channel')).toBe('ws://hq-web/relay-line')
  })

  it('resolves against a stored bare origin too', () => {
    expect(resolveLineUrl('/relay-line', 'wss://hq.example.com')).toBe('wss://hq.example.com/relay-line')
  })

  it('takes an absolute address, turning http(s) into ws(s)', () => {
    expect(resolveLineUrl('wss://files-2.example.com/relay-line', HQ)).toBe('wss://files-2.example.com/relay-line')
    expect(resolveLineUrl('https://files-2.example.com/relay-line', HQ)).toBe('wss://files-2.example.com/relay-line')
    expect(resolveLineUrl('http://10.0.0.5:8080/relay-line', HQ)).toBe('ws://10.0.0.5:8080/relay-line')
  })

  it.each([
    ['another scheme', 'file:///etc/passwd'],
    ['a script', 'javascript:alert(1)'],
    ['credentials in the address', 'wss://user:pw@files.example.com/relay-line'],
    ['nothing', ''],
    ['an address far too long', `/${'a'.repeat(3000)}`],
  ])('refuses %s', (_name, lineUrl) => {
    expect(resolveLineUrl(lineUrl, HQ)).toBeNull()
  })

  it('refuses when hq\'s own address cannot be read', () => {
    expect(resolveLineUrl('/relay-line', 'not a url')).toBeNull()
  })
})
