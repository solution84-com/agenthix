/**
 * Where uploaded files are served from (host-management spec §16, adr-0114): an origin of their own,
 * `FILES_ORIGIN`, so HQ's own address never serves content someone uploaded.
 *
 * - `FILES_ORIGIN` set: that origin. The host service sets it at install — `files.<HQ's host>` for a domain.
 * - Unset, with HQ on `localhost`: `files.localhost` on HQ's own scheme and port, which every browser resolves to
 *   this machine, so a developer and a local install need no setting.
 * - Otherwise there is no host name to give files: HQ serves them from its own address, only as downloads.
 */
import { getSitePublicUrl } from '../siteConfig'

export type FilesPlace =
  | { mode: 'origin'; origin: string; host: string }
  | { mode: 'downloadsOnly'; reason: 'bareAddress' | 'notSet'; origin: string }

const ORIGIN = /^https?:\/\/([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:.]+\])(:\d{1,5})?$/i

/** A host name with no port, lowercase and without brackets. */
export function hostOf(value: string | undefined): string {
  if (!value) return ''
  const h = value.trim().toLowerCase().replace(/\.$/, '')
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']'))
  return h.replace(/:\d+$/, '')
}

const isLocalName = (host: string) => host === 'localhost' || host.endsWith('.localhost')
/** A network address, a single word or a `.local` name: an address that can have no subdomain anyone reaches. */
const hasNoSubdomains = (host: string) =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || !host.includes('.') || host.endsWith('.local')

function parsedOrigin(raw: string | undefined): URL | null {
  const value = raw?.trim().replace(/\/+$/, '')
  if (!value || !ORIGIN.test(value)) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function filesPlace(env: NodeJS.ProcessEnv = process.env, hqUrl: string = getSitePublicUrl()): FilesPlace {
  const hq = parsedOrigin(hqUrl)
  const hqOrigin = hq?.origin ?? hqUrl
  const hqHost = hostOf(hq?.host)
  const set = parsedOrigin(env.FILES_ORIGIN)
  // An origin that is HQ's own would serve uploads beside HQ's app, which is what this exists to prevent.
  if (set && hostOf(set.host) !== hqHost) return { mode: 'origin', origin: set.origin, host: hostOf(set.host) }
  if (hq && isLocalName(hqHost)) {
    const origin = `${hq.protocol}//files.localhost${hq.port ? `:${hq.port}` : ''}`
    return { mode: 'origin', origin, host: 'files.localhost' }
  }
  return { mode: 'downloadsOnly', reason: hq && hasNoSubdomains(hqHost) ? 'bareAddress' : 'notSet', origin: hqOrigin }
}

/** Whether a request's Host header names the files origin. */
export function isFilesHost(hostHeader: string | undefined, place: FilesPlace): boolean {
  return place.mode === 'origin' && hostOf(hostHeader) === place.host
}
