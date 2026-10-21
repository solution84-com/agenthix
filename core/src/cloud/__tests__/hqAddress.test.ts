import { describe, expect, it } from 'vitest'
import {
  cloudHqAddressOf, cloudSignInRedirectUri, isCloudRedirectUriFor, parseCloudAddressRegistered, parseCloudAddressRequest,
} from '../hqAddress.js'
import { JWT_BEARER_ASSERTION_TYPE } from '../connection.js'

describe("hq's address, as Cloud registers it @SC-1135", () => {
  it('is the origin and path, with no trailing slash, and the same however it is written', () => {
    expect(cloudHqAddressOf('https://hq.acme.example')).toBe('https://hq.acme.example')
    expect(cloudHqAddressOf('https://HQ.Acme.Example:443/')).toBe('https://hq.acme.example')
    expect(cloudHqAddressOf('https://acme.example/hq//')).toBe('https://acme.example/hq')
    expect(cloudHqAddressOf('http://localhost:4100')).toBe('http://localhost:4100')
  })

  it('is refused with credentials, a query, a fragment, or any scheme but http and https', () => {
    for (const bad of ['javascript:alert(1)', 'ftp://hq.acme.example', 'https://u:p@hq.acme.example', 'https://hq.acme.example/?next=x', 'https://hq.acme.example/#x', 'not a url', 7, null]) {
      expect(cloudHqAddressOf(bad)).toBeNull()
    }
    expect(cloudHqAddressOf(`https://hq.acme.example/${'a'.repeat(500)}`)).toBeNull()
  })
})

describe('where Cloud may send a sign-in back to @SC-1135', () => {
  it("is hq's registered address with the sign-in path, exactly", () => {
    expect(cloudSignInRedirectUri('https://hq.acme.example')).toBe('https://hq.acme.example/login/cloud')
    expect(cloudSignInRedirectUri('https://acme.example/hq/')).toBe('https://acme.example/hq/login/cloud')
    expect(isCloudRedirectUriFor('https://hq.acme.example/login/cloud', 'https://hq.acme.example')).toBe(true)
  })

  it('is nowhere else: another host, path, scheme, port or query is refused', () => {
    const registered = 'https://hq.acme.example'
    for (const other of [
      'https://evil.example/login/cloud', 'https://hq.acme.example.evil.example/login/cloud', 'http://hq.acme.example/login/cloud',
      'https://hq.acme.example:8443/login/cloud', 'https://hq.acme.example/login/cloud?x=1', 'https://hq.acme.example/login/cloud/',
      'https://hq.acme.example/other', 'https://HQ.acme.example/login/cloud',
    ]) {
      expect(isCloudRedirectUriFor(other, registered)).toBe(false)
    }
  })
})

describe("hq telling Cloud its address @SC-1135", () => {
  const auth = { client_assertion_type: JWT_BEARER_ASSERTION_TYPE, client_assertion: 'a.b.c' }

  it('Cloud reads the request, its address normalised, and refuses one that is not an address', () => {
    expect(parseCloudAddressRequest({ ...auth, hq_address: 'https://HQ.acme.example/' })).toEqual({ hq_address: 'https://hq.acme.example' })
    expect(parseCloudAddressRequest({ ...auth, hq_address: 'https://hq.acme.example?x' })).toBeNull()
    expect(parseCloudAddressRequest(auth)).toBeNull()
  })

  it('hq reads the answer: the address as registered', () => {
    expect(parseCloudAddressRegistered({ hq_address: 'https://hq.acme.example' })).toEqual({ hq_address: 'https://hq.acme.example' })
    expect(parseCloudAddressRegistered({ hq_address: 'javascript:1' })).toBeNull()
    expect(parseCloudAddressRegistered({})).toBeNull()
  })
})
