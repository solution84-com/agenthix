/**
 * The settings a preview needs from hq's own environment, and the one place a
 * preview's address is built or read back (adr-0071).
 *
 * A preview is served from a host name of its own, `p-<row id>.<preview
 * domain>`, on hq's own port — never from hq's own origin, whose storage holds
 * the viewer's sign-in.
 *
 * The id in the host is the row's own id, not its token. A host name is
 * lowercase and ends up in logs, DNS queries and a browser's history, and a
 * cuid fits a DNS label as it is; the row id is also not a credential, because
 * nothing is served on it without the access check. The token stays out of
 * every address.
 */
import { getSitePublicUrl, getSiteClientUrl } from '../server/siteConfig'

export const PREVIEW_TTL_MS = Number(process.env.PREVIEW_TTL_MS ?? 30 * 60 * 1000)

/** Where a preview host sends a browser to redeem its one-time ticket. Never relayed. */
export const PREVIEW_ENTER_PATH = '/__agenthix/enter'

/** hq's own server address — a preview host shares its scheme and port. */
export function hqBaseUrl(): string {
  return getSitePublicUrl() || 'http://localhost:3000'
}

/** hq's browser app, where the access check's page lives. */
export function hqClientUrl(): string {
  return getSiteClientUrl() || hqBaseUrl()
}

/**
 * The install's preview domain, or null when previews are off.
 *
 * "Deployed" is `NODE_ENV=production`, the same test hq already uses to decide
 * which settings a deployment must set (envValidation.ts, siteConfig.ts): the
 * server image sets it, `wasp start` does not. On a developer's machine
 * `*.preview.localhost` needs no setting, because browsers resolve every
 * `*.localhost` name to loopback. A deployment that sets none has previews off.
 */
export function previewDomain(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.PREVIEW_DOMAIN?.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
  if (raw) return raw
  return env.NODE_ENV === 'production' ? null : 'preview.localhost'
}

/** The preview id a Host header names, or null when it is not a preview host. */
export function previewIdFromHost(host: string | undefined, domain: string | null): string | null {
  if (!host || !domain) return null
  const name = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  const suffix = `.${domain}`
  if (!name.endsWith(suffix)) return null
  const m = name.slice(0, -suffix.length).match(/^p-([a-z0-9]+)$/)
  return m ? m[1] : null
}

/** A preview's own origin: hq's scheme and port, the preview's host name. */
export function previewOrigin(id: string, domain: string, hqUrl: string = hqBaseUrl()): string {
  const hq = new URL(hqUrl)
  return `${hq.protocol}//p-${id}.${domain}${hq.port ? `:${hq.port}` : ''}`
}
