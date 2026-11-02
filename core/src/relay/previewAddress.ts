/**
 * A live app's address (live preview spec section 5): an origin of its own, built by hq from a pattern and the
 * app's id, which is random, at least 128 bits, given when hq first records the app, and never its name. The relay
 * reads the id back from the name a browser asked for.
 *
 * A pattern is an origin with `{id}` once, inside its first label: `https://p-{id}.preview.example.com`. Only that
 * label varies, so one wildcard DNS record and one front door cover every app. An `http:` pattern is accepted only
 * under `.localhost`, which browsers resolve to the machine itself and treat as secure.
 *
 * | Install | Pattern |
 * |---|---|
 * | Self-hosted | `previewPatternForDomain(<preview domain>)`, the domain set in the Fleet Console |
 * | Self-hosted at `http://localhost:<port>` | `previewPatternForLoopback(<port>)`: HQ's own port, for the machine's own browser |
 * | A hosted service | the pattern it supplies to hq |
 * | Development | `DEV_PREVIEW_PATTERN` |
 * | Reached by a bare network address | none: live apps are off |
 *
 * Platform-neutral: no `Buffer`, no `node:*`.
 */
import { SERVICE_PORTS } from '../ports/ports.js'
import { randomBytes } from '../host/crypto/webCrypto.js'

export const APP_ID_PLACEHOLDER = '{id}'

/** Lower-case base32 (RFC 4648's alphabet): DNS names ignore case, so an id must not depend on it. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
/** 26 characters of 5 random bits each: 130 bits. */
export const APP_ID_LENGTH = 26
const APP_ID = new RegExp(`^[${ALPHABET}]{${APP_ID_LENGTH}}$`)

export function newAppId(): string {
  // 256 is a multiple of 32, so taking the low five bits of each byte keeps every character equally likely.
  return Array.from(randomBytes(APP_ID_LENGTH), b => ALPHABET[b & 31]).join('')
}

export function isAppId(value: unknown): value is string {
  return typeof value === 'string' && APP_ID.test(value)
}

/** The self-hosted pattern for a preview domain the fleet admin set. */
export function previewPatternForDomain(domain: string): string {
  return `https://p-${APP_ID_PLACEHOLDER}.${domain.trim().toLowerCase().replace(/\.$/, '')}`
}

/**
 * An install reached at `http://localhost:<port>`: every app under `preview.localhost` on HQ's own published port,
 * where hq-web passes them to the relay. Only the machine's own browser opens them. Null for a port that is not one.
 */
export function previewPatternForLoopback(port: number): string | null {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  return `http://p-${APP_ID_PLACEHOLDER}.preview.localhost${port === 80 ? '' : `:${port}`}`
}

/** Development: every app under `preview.localhost`, answered by the relay on its own port. */
export const DEV_PREVIEW_PATTERN = `http://p-${APP_ID_PLACEHOLDER}.preview.localhost:${SERVICE_PORTS.relay.server}`

/**
 * The name the relay answers itself under the preview domain, for the Fleet Console's check that DNS, the certificate
 * and the relay all answer. Never an app's id: an id is `APP_ID_LENGTH` characters.
 */
export const PREVIEW_CHECK_ID = 'check'

/**
 * What the relay answers on the check name, as plain text, and nothing else does: hq-web's page or another server's
 * never reads this way, so the check knows the request reached the relay.
 */
export const PREVIEW_CHECK_ANSWER = 'This relay answers live apps at this address.'

export type PreviewPattern = {
  scheme: 'https' | 'http'
  /** What comes before and after the id inside the first label. */
  prefix: string
  suffix: string
  /** Every label after the first, lower case, without a trailing dot. */
  domain: string
  port: number | null
}

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const LABEL_PART = /^[a-z0-9-]{0,30}$/
const IPV4ISH = /^[0-9.]+$/

/** The pattern's parts, or null when it is not a pattern an app's address can be built from. */
export function parsePreviewPattern(pattern: unknown): PreviewPattern | null {
  if (typeof pattern !== 'string' || pattern.length > 300) return null
  const m = /^(https|http):\/\/([^/:?#]+)(?::(\d{1,5}))?$/.exec(pattern)
  if (!m) return null
  const [, scheme, host, portText] = m
  const port = portText === undefined ? null : Number(portText)
  if (port !== null && (port < 1 || port > 65535)) return null
  const labels = host.split('.')
  const first = labels[0]
  const at = first.indexOf(APP_ID_PLACEHOLDER)
  if (at < 0 || first.indexOf(APP_ID_PLACEHOLDER, at + 1) >= 0 || host.indexOf(APP_ID_PLACEHOLDER, first.length) >= 0) return null
  const prefix = first.slice(0, at)
  const suffix = first.slice(at + APP_ID_PLACEHOLDER.length)
  if (!LABEL_PART.test(prefix) || !LABEL_PART.test(suffix) || !LABEL.test(`${prefix}${'a'.repeat(APP_ID_LENGTH)}${suffix}`)) return null
  const rest = labels.slice(1)
  const domain = rest.join('.')
  if (rest.length < 2 && domain !== 'localhost') return null
  if (!rest.every(l => LABEL.test(l)) || IPV4ISH.test(domain)) return null
  const local = domain === 'localhost' || domain.endsWith('.localhost')
  if (scheme === 'http' && !local) return null
  return { scheme: scheme as 'https' | 'http', prefix, suffix, domain, port }
}

/** The app's origin under the pattern, or null when the pattern or the id is not one. */
export function previewOrigin(pattern: string, appId: string): string | null {
  const p = parsePreviewPattern(pattern)
  if (!p || (!isAppId(appId) && appId !== PREVIEW_CHECK_ID)) return null
  return `${p.scheme}://${p.prefix}${appId}${p.suffix}.${p.domain}${p.port === null ? '' : `:${p.port}`}`
}

/**
 * The app id a browser's `Host` names under the pattern, or null: another domain, another port, or a first label that
 * is not the pattern's with an app's id in it. `PREVIEW_CHECK_ID` comes back as itself.
 */
export function appIdFromHost(pattern: string, host: string): string | null {
  const p = parsePreviewPattern(pattern)
  if (!p || typeof host !== 'string') return null
  const m = /^([^:]+)(?::(\d{1,5}))?$/.exec(host.trim().toLowerCase())
  if (!m) return null
  const port = m[2] === undefined ? null : Number(m[2])
  const defaultPort = p.scheme === 'https' ? 443 : 80
  if ((port ?? defaultPort) !== (p.port ?? defaultPort)) return null
  const name = m[1].replace(/\.$/, '')
  const dot = name.indexOf('.')
  if (dot < 0 || name.slice(dot + 1) !== p.domain) return null
  const first = name.slice(0, dot)
  if (!first.startsWith(p.prefix) || !first.endsWith(p.suffix) || first.length < p.prefix.length + p.suffix.length) return null
  const id = first.slice(p.prefix.length, first.length - p.suffix.length)
  return isAppId(id) || id === PREVIEW_CHECK_ID ? id : null
}
