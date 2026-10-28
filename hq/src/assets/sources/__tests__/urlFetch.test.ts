import { describe, expect, it } from 'vitest'
import { PACKAGE_MAX_BYTES } from '@agenthix/core'
import { fetchPackageFromUrl, UrlFetchRefused, type Connect, type HttpResponse, type Resolve } from '../urlFetch'

const PUBLIC = '140.82.112.3'
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])
const BUNDLE = new TextEncoder().encode('{"mediaType":"application/vnd.dev.sigstore.bundle.v0.3+json"}')

type Route = { status: number; location?: string; body?: AsyncIterable<Uint8Array>; length?: number }

async function* chunks(...parts: Uint8Array[]) {
  for (const part of parts) yield part
}

async function* stalls(first: Uint8Array) {
  yield first
  await new Promise(() => {})
}

/** A fake internet: names to addresses, and URLs to answers. Records every connection made. */
function network(routes: Record<string, Route>, names: Record<string, string[]> = { 'example.com': [PUBLIC] }) {
  const connections: Array<{ url: string; address: string; headers: Record<string, string> }> = []
  const resolve: Resolve = async (hostname) => {
    const found = names[hostname]
    if (!found) throw new Error(`ENOTFOUND ${hostname}`)
    return found.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  }
  const connect: Connect = async ({ url, address, headers }) => {
    connections.push({ url: url.href, address: address.address, headers })
    const route = routes[url.href]
    if (!route) throw new Error('ECONNREFUSED')
    const response: HttpResponse = {
      status: route.status,
      headers: {
        ...(route.location ? { location: route.location } : {}),
        ...(route.length !== undefined ? { 'content-length': String(route.length) } : {}),
      },
      body: route.body ?? chunks(),
      close: () => {},
    }
    return response
  }
  return { resolve, connect, connections }
}

const LINK = 'https://example.com/skills/pdf.zip'
const SIG = `${LINK}.sigstore.json`

async function refusal(promise: Promise<unknown>): Promise<UrlFetchRefused> {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(UrlFetchRefused)
  return error as UrlFetchRefused
}

describe('fetchPackageFromUrl @security-M3 @SC-1611', () => {
  it('fetches a package and its signature', async () => {
    const net = network({ [LINK]: { status: 200, body: chunks(ZIP) }, [SIG]: { status: 200, body: chunks(BUNDLE) } })
    const fetched = await fetchPackageFromUrl(LINK, net)
    expect(fetched.bytes).toEqual(ZIP)
    expect(fetched.signature).toEqual(BUNDLE)
    expect(net.connections.map((c) => c.address)).toEqual([PUBLIC, PUBLIC])
  })

  it('fetches a package without a signature when the signature is not there', async () => {
    const net = network({ [LINK]: { status: 200, body: chunks(ZIP.slice(0, 3), ZIP.slice(3)) }, [SIG]: { status: 404 } })
    const fetched = await fetchPackageFromUrl(LINK, net)
    expect(fetched.bytes).toEqual(ZIP)
    expect(fetched.signature).toBeNull()
  })

  it('refuses the whole fetch when a signature is there but cannot be read', async () => {
    const net = network({ [LINK]: { status: 200, body: chunks(ZIP) }, [SIG]: { status: 500 } })
    expect((await refusal(fetchPackageFromUrl(LINK, net))).reason).toBe('unreachable')
  })

  it('sends no cookies, credentials or hq headers', async () => {
    const net = network({ [LINK]: { status: 200, body: chunks(ZIP) }, [SIG]: { status: 404 } })
    await fetchPackageFromUrl(LINK, net)
    for (const { headers } of net.connections) {
      expect(Object.keys(headers).sort()).toEqual(['accept', 'accept-encoding'])
    }
  })

  it('refuses a link that is not https', async () => {
    const net = network({})
    const error = await refusal(fetchPackageFromUrl('http://example.com/pdf.zip', net))
    expect(error.reason).toBe('not-https')
    expect(error.message).toMatch(/Nothing was changed\.$/)
    expect(net.connections).toEqual([])
  })

  it.each([
    ['not a link', 'not-a-link'],
    ['https://user:secret@example.com/pdf.zip', 'credentials'],
    ['https://example.com:8443/pdf.zip', 'port'],
  ])('refuses %s before connecting', async (link, reason) => {
    const net = network({})
    expect((await refusal(fetchPackageFromUrl(link, net))).reason).toBe(reason)
    expect(net.connections).toEqual([])
  })

  it.each([
    'https://0.0.0.0/p.zip', 'https://[::]/p.zip', 'https://[::ffff:127.0.0.1]/p.zip', 'https://169.254.169.254/p.zip',
    'https://[fd00::1]/p.zip', 'https://2130706433/p.zip', 'https://0x7f000001/p.zip', 'https://127.1/p.zip',
    'https://10.0.0.5/p.zip', 'https://[fe80::1]/p.zip', 'https://[ff02::1]/p.zip', 'https://224.0.0.1/p.zip',
  ])('refuses the address in %s without connecting', async (link) => {
    const net = network({ [link]: { status: 200, body: chunks(ZIP) } })
    expect((await refusal(fetchPackageFromUrl(link, net))).reason).toBe('unreachable')
    expect(net.connections).toEqual([])
  })

  it('refuses a name that resolves to a private address', async () => {
    const net = network({}, { 'example.com': ['192.168.1.20'] })
    expect((await refusal(fetchPackageFromUrl(LINK, net))).reason).toBe('unreachable')
    expect(net.connections).toEqual([])
  })

  it('refuses a name when any address it resolves to is private', async () => {
    const net = network({}, { 'example.com': [PUBLIC, '127.0.0.1'] })
    expect((await refusal(fetchPackageFromUrl(LINK, net))).reason).toBe('unreachable')
    expect(net.connections).toEqual([])
  })

  it('pins the connection to the address it resolved', async () => {
    let lookups = 0
    const net = network({ [LINK]: { status: 200, body: chunks(ZIP) }, [SIG]: { status: 404 } })
    const resolve: Resolve = async (hostname) => {
      lookups++
      return net.resolve(hostname)
    }
    await fetchPackageFromUrl(LINK, { ...net, resolve })
    expect(lookups).toBe(2) // once for the package and once for its signature, never again in between
    expect(net.connections.every((c) => c.address === PUBLIC)).toBe(true)
  })

  it('follows a redirect to a public address, checked the same way', async () => {
    const net = network(
      { [LINK]: { status: 302, location: 'https://cdn.example.org/pdf.zip' }, 'https://cdn.example.org/pdf.zip': { status: 200, body: chunks(ZIP) }, [SIG]: { status: 404 } },
      { 'example.com': [PUBLIC], 'cdn.example.org': ['2606:4700::1111'] },
    )
    const fetched = await fetchPackageFromUrl(LINK, net)
    expect(fetched.bytes).toEqual(ZIP)
    expect(net.connections.map((c) => c.address)).toEqual([PUBLIC, '2606:4700::1111', PUBLIC])
  })

  it.each([
    ['a private address', 'https://internal.example.org/pdf.zip'],
    ['a literal loopback address', 'https://127.0.0.1/pdf.zip'],
    ['the metadata service', 'https://169.254.169.254/latest/meta-data/'],
    ['plain http', 'http://cdn.example.org/pdf.zip'],
    ['another port', 'https://cdn.example.org:4100/pdf.zip'],
  ])('refuses a redirect to %s', async (_what, location) => {
    const net = network({ [LINK]: { status: 301, location } }, { 'example.com': [PUBLIC], 'internal.example.org': ['10.1.2.3'], 'cdn.example.org': [PUBLIC] })
    expect((await refusal(fetchPackageFromUrl(LINK, net))).reason).toBe('unreachable')
    expect(net.connections.map((c) => c.url)).toEqual([LINK])
  })

  it('follows three redirects and refuses a fourth', async () => {
    const hop = (n: number) => `https://example.com/hop/${n}`
    const routes: Record<string, Route> = { [LINK]: { status: 307, location: hop(1) }, [SIG]: { status: 404 } }
    for (let n = 1; n <= 4; n++) routes[hop(n)] = { status: 308, location: hop(n + 1) }
    routes[hop(3)] = { status: 200, body: chunks(ZIP) }
    expect((await fetchPackageFromUrl(LINK, network(routes))).bytes).toEqual(ZIP)

    routes[hop(3)] = { status: 302, location: hop(4) }
    routes[hop(4)] = { status: 200, body: chunks(ZIP) }
    expect((await refusal(fetchPackageFromUrl(LINK, network(routes)))).reason).toBe('unreachable')
  })

  it('refuses a body larger than a package may be, while it streams', async () => {
    const big = new Uint8Array(1024 * 1024)
    const net = network({ [LINK]: { status: 200, body: chunks(...new Array<Uint8Array>(PACKAGE_MAX_BYTES / big.length + 1).fill(big)) } })
    expect((await refusal(fetchPackageFromUrl(LINK, net))).reason).toBe('too-large')
  })

  it('refuses a body whose declared length is too large without reading it', async () => {
    const net = network({ [LINK]: { status: 200, length: PACKAGE_MAX_BYTES + 1, body: stalls(ZIP) } })
    expect((await refusal(fetchPackageFromUrl(LINK, net))).reason).toBe('too-large')
  })

  it('gives up on a slow body once the time is up', async () => {
    const net = network({ [LINK]: { status: 200, body: stalls(ZIP) } })
    const started = Date.now()
    expect((await refusal(fetchPackageFromUrl(LINK, { ...net, timeoutMs: 50 }))).reason).toBe('unreachable')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('gives up on a connection that never answers', async () => {
    const net = network({})
    const connect: Connect = () => new Promise(() => {})
    expect((await refusal(fetchPackageFromUrl(LINK, { ...net, connect, timeoutMs: 50 }))).reason).toBe('unreachable')
  })

  it('says the same thing whatever went wrong on the way', async () => {
    const closed = await refusal(fetchPackageFromUrl(LINK, network({})))
    const missing = await refusal(fetchPackageFromUrl(LINK, network({ [LINK]: { status: 404 } })))
    const unknownName = await refusal(fetchPackageFromUrl('https://nowhere.example.net/p.zip', network({})))
    const privateName = await refusal(fetchPackageFromUrl(LINK, network({}, { 'example.com': ['127.0.0.1'] })))
    const notZip = await refusal(fetchPackageFromUrl(LINK, network({ [LINK]: { status: 500 } })))
    const messages = new Set([closed, missing, unknownName, privateName, notZip].map((e) => e.message))
    expect(messages.size).toBe(1)
    expect([...messages][0]).toMatch(/Nothing was changed\.$/)
  })
})
