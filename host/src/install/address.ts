/**
 * HQ's address, as the one install question takes it: what makes it unusable, whether only this machine can use
 * it, and where hq-web listens because of it. Shared by the CLI (which asks) and the host service (which checks
 * again before it acts).
 */
import type { HqSettings } from '../compose/projects'

/** Why `address` cannot be HQ's address, in words a person reads; null when it can. */
export function addressProblem(address: string): string | null {
  if (!/^https?:\/\//.test(address)) return 'it must start with http:// or https://'
  if (address.endsWith('/')) return 'it must not end in a slash'
  const rest = address.replace(/^https?:\/\//, '')
  if (!rest || rest.includes('/') || /\s/.test(rest)) return 'it is a scheme and a host, perhaps with a port, and nothing more'
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return 'it is not an address a browser can open'
  }
  if (!url.hostname) return 'it has no host'
  return null
}

/** Whether only this machine can open the address. */
export function isLocalAddress(address: string): boolean {
  const host = new URL(address).hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host)
}

/**
 * Where hq-web is published, from HQ's address; its port is the installation's (`ports.ts`). An https address is
 * served by a front door on this machine, which reaches hq-web inside Docker, or by a proxy of the machine's own on
 * 127.0.0.1. A plain-http address on this machine stays on it; any other plain-http address is opened to the network.
 */
export function listenerFor(address: string): Pick<HqSettings, 'bind' | 'trustedProxies'> {
  const url = new URL(address)
  if (url.protocol === 'https:') return { bind: '127.0.0.1', trustedProxies: 2 }
  if (isLocalAddress(address)) return { bind: '127.0.0.1', trustedProxies: 1 }
  return { bind: '0.0.0.0', trustedProxies: 1 }
}

/** Whether a host name can have a subdomain anyone can reach: not a network address, a single word or a `.local` name. */
function hasSubdomains(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false
  return host.includes('.') && !host.endsWith('.local')
}

/**
 * Where files are served from, beside HQ (host-management spec §16, adr-0114): `files.localhost` on
 * HQ's own port for a local address, `files.<HQ's host>` for a domain, and none — HQ offers files only as
 * downloads — where its address can have no subdomain.
 */
export function filesOriginFor(address: string): string | null {
  const url = new URL(address)
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const port = url.port ? `:${url.port}` : ''
  if (host === 'localhost' || host.endsWith('.localhost')) return `${url.protocol}//files.localhost${port}`
  return hasSubdomains(host) ? `${url.protocol}//files.${host}${port}` : null
}

/** Uploaded files' origin at `host`, on HQ's scheme and port: https only when HQ's address is https. */
export function filesOriginAt(address: string, host: string): string {
  const url = new URL(address)
  return `${url.protocol}//${host.toLowerCase()}${url.port ? `:${url.port}` : ''}`
}

/** What HQ's settings record of its files host. `filesChosen` only when a person named one other than the default. */
export type FilesSettings = Pick<HqSettings, 'filesOrigin' | 'filesChosen'>

/** A files host a person named for HQ at `address`, recorded as chosen unless it is the default one. */
export function chosenFiles(address: string, host: string): FilesSettings {
  const byDefault = filesOriginFor(address)
  const chosen = !byDefault || new URL(byDefault).hostname !== host.toLowerCase()
  return { filesOrigin: filesOriginAt(address, host), filesChosen: chosen ? true : undefined }
}

/**
 * The files host HQ keeps at `address`, from what `before` recorded: a chosen host is kept, on the new address's
 * scheme and port, unless it is the new address's own host or the address is this machine's own; otherwise the
 * default. Used whenever HQ's settings are written for an address (an install, a new address, a move's restore).
 */
export function filesOfAddress(address: string, before?: FilesSettings): FilesSettings {
  if (before?.filesChosen && before.filesOrigin && !isLocalAddress(address)) {
    const host = new URL(before.filesOrigin).hostname.toLowerCase()
    if (host !== new URL(address).hostname.toLowerCase()) return chosenFiles(address, host)
  }
  return { filesOrigin: filesOriginFor(address), filesChosen: undefined }
}
