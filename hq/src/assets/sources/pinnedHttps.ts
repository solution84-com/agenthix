import dns from 'node:dns/promises'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import type { Connect, Resolve, ResolvedAddress } from './urlFetch'

export const resolveAll: Resolve = async (hostname) =>
  (await dns.lookup(hostname, { all: true, order: 'verbatim' })).map((r) => ({
    address: r.address,
    family: r.family === 6 ? 6 : 4,
  }))

/**
 * A lookup that answers every question with the one address already checked, so the socket connects there and the
 * name is never resolved a second time (which a rebinding DNS server would answer differently). TLS still checks
 * the certificate against the host name in the link.
 */
export function pinnedLookup(pinned: ResolvedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address: pinned.address, family: pinned.family }])
    else callback(null, pinned.address, pinned.family)
  }
}

/** A GET over https to the pinned address: no agent (so no shared sockets or keep-alive), no cookies, no credentials. */
export const connectPinned: Connect = ({ url, address, headers, signal }) =>
  new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: 'GET',
        protocol: 'https:',
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: 443,
        path: `${url.pathname}${url.search}`,
        headers,
        agent: false,
        lookup: pinnedLookup(address),
        signal,
      },
      (response) =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: response,
          close: () => response.destroy(),
        }),
    )
    request.on('error', reject)
    request.end()
  })
