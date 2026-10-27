/**
 * The relay's settings, all from its environment, which the host service sets when it starts the relay's container
 * (and `scripts/dev` in development). A relay holds nothing, so this is all it knows before hq greets it.
 */
import { SERVICE_PORTS } from '@agenthix/core'
import { filesHostOf } from './filesHost'

export const RELAY_DEFAULT_PORT: number = SERVICE_PORTS.relay.server
/** Outside a container the relay listens on the machine's loopback; its image sets `0.0.0.0`. */
export const RELAY_DEFAULT_LISTEN_HOST = '127.0.0.1'
/** As the pairing secret: long enough that guessing it is not a plan. */
export const MIN_SECRET_LENGTH = 32

export type RelayConfig = {
  listenHost: string
  port: number
  /** Where the relay dials hq: inside hq's compose set, hq-server on its own network. */
  hqAddress: string
  /** The shared secret it presents on the hq link. Never logged. */
  secret: string
  /** The app's origin, the one origin given CORS. Null: no origin is. */
  appOrigin: string | null
  /** The host name the relay answers browsers on. Null: it answers no browser (phase 2 adds the bare address). */
  filesHost: string | null
  /**
   * hq's storage folder as mounted into the relay, read-only, for the uploads hq's relay serves. Null: none is named.
   * Whether it is there is decided when the relay starts (`openUploadFolder`): without it the relay starts and says
   * plainly that it does not serve uploads.
   */
  uploadsRoot: string | null
}

export class ConfigError extends Error {}

const ORIGIN = /^https?:\/\/([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:.]+\])(:\d{1,5})?$/i

/** An origin with no path, as the browser sends it in `Origin`; null for anything else. */
export function originOf(raw: string | undefined): string | null {
  const value = raw?.trim().replace(/\/+$/, '')
  if (!value || !ORIGIN.test(value)) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/**
 * Reads the configuration, refusing to start without what it needs: hq's address and the shared secret.
 *
 * - `RELAY_HQ_ADDRESS`: where to dial hq. https, or plain http only to this machine, a private address or a
 *   container name, because the secret goes with it.
 * - `HQ_RELAY_SECRET`: the shared secret with hq, at least 32 characters.
 * - `HQ_URL`: hq's public address, the app's origin; `RELAY_HQ_ADDRESS` when unset.
 * - `FILES_ORIGIN`: the files address; unset, `files.localhost` when hq is on localhost, as hq-web decides.
 * - `RELAY_PORT`, `RELAY_LISTEN_HOST`.
 * - `HQ_UPLOADS_ROOT`: hq's storage folder, mounted read-only, on hq's relay only.
 */
export function loadConfig(env: NodeJS.ProcessEnv): RelayConfig {
  const hqAddress = env.RELAY_HQ_ADDRESS?.trim()
  if (!hqAddress) throw new ConfigError("RELAY_HQ_ADDRESS is not set: the relay needs hq's address to dial. Nothing was started.")
  const problem = hqAddressProblem(hqAddress)
  if (problem) throw new ConfigError(`${problem} Nothing was started.`)
  const secret = env.HQ_RELAY_SECRET?.trim() ?? ''
  if (!secret) throw new ConfigError('HQ_RELAY_SECRET is not set: the relay needs the secret it shares with hq. Nothing was started.')
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new ConfigError(`HQ_RELAY_SECRET is shorter than ${MIN_SECRET_LENGTH} characters: make a longer one, in hq's environment too. Nothing was started.`)
  }

  const port = env.RELAY_PORT ? Number(env.RELAY_PORT) : RELAY_DEFAULT_PORT
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError(`RELAY_PORT is not a port: ${env.RELAY_PORT}. Nothing was started.`)

  const hqUrl = env.HQ_URL?.trim() || hqAddress
  const appOrigin = originOf(hqUrl)
  if (env.HQ_URL?.trim() && !appOrigin) throw new ConfigError(`HQ_URL is not an origin: ${env.HQ_URL}. Nothing was started.`)
  if (env.FILES_ORIGIN?.trim() && !originOf(env.FILES_ORIGIN)) {
    throw new ConfigError(`FILES_ORIGIN is a scheme and a host name, perhaps with a port, and nothing more (got ${env.FILES_ORIGIN}). Nothing was started.`)
  }
  return {
    listenHost: env.RELAY_LISTEN_HOST?.trim() || RELAY_DEFAULT_LISTEN_HOST,
    port,
    hqAddress,
    secret,
    appOrigin,
    filesHost: filesHostOf(env.FILES_ORIGIN, hqUrl),
    uploadsRoot: env.HQ_UPLOADS_ROOT?.trim() || null,
  }
}

export function hqAddressProblem(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return `RELAY_HQ_ADDRESS is not an address: "${raw}". Give hq's full address, e.g. https://hq.example.com.`
  }
  if (url.protocol === 'https:') return null
  if (url.protocol !== 'http:') return `RELAY_HQ_ADDRESS must start with https:// (got ${url.protocol}//).`
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (isLocalOrPrivate(host) || isContainerName(host)) return null
  return `Refusing http://${url.hostname}: the relay would send its secret there unencrypted. Use https://, or an address on this machine or a private network.`
}

function isLocalOrPrivate(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'host.docker.internal' || host === '::1') return true
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (!m) return false
  const a = Number(m[1]), b = Number(m[2])
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/** A single-label name: a container on a Docker network the two share, such as `hq-server`. */
function isContainerName(host: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(host) && !/^\d+$/.test(host)
}
