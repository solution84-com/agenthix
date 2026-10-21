import dns from 'node:dns/promises'

/**
 * A site sends its credential to the address it dials hq on, so that address must not send it in the clear across a
 * network the site does not control. Plain http is allowed only to the machine itself or a private network.
 */
export function hqUrlProblem(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return `Not a URL: "${raw}". Give hq's full address, e.g. https://hq.example.com`
  }
  if (url.protocol === 'https:') return null
  if (url.protocol !== 'http:') return `hq's address must start with https:// (got ${url.protocol}//)`
  if (isLocal(url.hostname)) return null
  return `Refusing http://${url.hostname}: this site sends hq its credential, which plain http would send unencrypted. Use https://, or an address on this machine or a private network.`
}

function isLocal(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'host.docker.internal' || host.endsWith('.local') || host === '::1') return true
  return isPrivateIpv4(host)
}

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (!m) return false
  const a = Number(m[1]), b = Number(m[2])
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

/** A resolved address on the machine or a private network: private IPv4, loopback, or IPv6 unique-local and link-local. */
function isPrivateAddress(address: string): boolean {
  const a = address.toLowerCase()
  if (isPrivateIpv4(a)) return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)
  if (mapped) return isPrivateIpv4(mapped[1])
  return a === '::1' || /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a)
}

/** One DNS label, not all digits: a container's name on a Docker network, never a name in public DNS. */
function isContainerName(hostname: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname) && !/^\d+$/.test(hostname)
}

export type ResolveAll = (hostname: string) => Promise<string[]>

const resolveAll: ResolveAll = async hostname => (await dns.lookup(hostname, { all: true })).map(r => r.address)

/**
 * The address the default site is given together with its pairing secret (adr-0070). On hq's machine the host
 * service gives it hq-web by container name on the private Docker network the two share (host-management spec
 * §10), so plain http to that name is allowed here — when the name is a
 * single label and every address it resolves to is private. Anything else is held to `hqUrlProblem`.
 */
export async function pairedHqUrlProblem(raw: string, resolve: ResolveAll = resolveAll): Promise<string | null> {
  const problem = hqUrlProblem(raw)
  if (!problem) return null
  const url = new URL(raw)
  if (url.protocol !== 'http:' || !isContainerName(url.hostname)) return problem
  let addresses: string[]
  try {
    addresses = await resolve(url.hostname)
  } catch {
    addresses = []
  }
  if (addresses.length === 0) {
    return `Not pairing over http://${url.hostname}: the name does not resolve on this site's networks, so it is not a container on the private network shared with hq. Check that hq is running.`
  }
  const outside = addresses.filter(a => !isPrivateAddress(a))
  if (outside.length > 0) {
    return `Refusing http://${url.hostname}: it resolves to ${outside.join(', ')}, outside a private network, and plain http would send the pairing secret there unencrypted.`
  }
  return null
}
