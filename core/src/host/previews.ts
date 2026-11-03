/**
 * Live apps' preview address on HQ's machine (live preview spec section 5): the domain the fleet admin sets on
 * the relay's page in the Fleet Console, every app answered at `p-<id>.<domain>` by HQ's relay, and the three checks
 * that say whether an app can really be reached there. The host service holds the domain, as it holds the files
 * address, because it gives the relay, hq and the front door their settings.
 */
import { parsePreviewPattern, previewPatternForDomain } from '../relay/previewAddress.js'

/** What `previews.set` and the figures report of one check, the facts only; the Fleet Console words them. */
export type PreviewCheck =
  /** `*.<domain>` resolves, and to where HQ's own name resolves (`expected`, empty when that could not be read). */
  | { name: 'dns'; ok: boolean; addresses: string[]; expected: string[] }
  /** The machine's port 443 answers `p-check.<domain>` with a certificate a browser accepts. */
  | { name: 'certificate'; ok: boolean; problem: string | null }
  /** The relay itself answers `p-check.<domain>` through whatever passes the name to it. */
  | { name: 'testApp'; ok: boolean; problem: string | null }

export type PreviewCheckName = PreviewCheck['name']

export const PREVIEW_CHECK_ORDER: readonly PreviewCheckName[] = ['dns', 'certificate', 'testApp']

export type PreviewsFigures = {
  /** The preview domain; null keeps live apps off. */
  domain: string | null
  /** When the checks last ran; null before they first did. */
  checkedAt: string | null
  /** The last checks, in `PREVIEW_CHECK_ORDER`; empty with no domain or before they ran. */
  checks: PreviewCheck[]
}

/** Live apps are on only when a domain is set and every check passed. */
export function previewsOn(f: PreviewsFigures): boolean {
  return f.domain !== null && f.checks.length === PREVIEW_CHECK_ORDER.length && f.checks.every(c => c.ok)
}

/** The first check that did not pass; null when none failed or none ran. */
export function failingPreviewCheck(f: PreviewsFigures): PreviewCheck | null {
  return f.checks.find(c => !c.ok) ?? null
}

/** The domain as it is kept: trimmed, lower case, without a trailing dot. */
export function normalisePreviewDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, '')
}

const MAX_DOMAIN_LENGTH = 224

/**
 * Why `domain` cannot be the preview address beside HQ's host and its files host, in words that follow "The preview
 * address cannot be <domain>: "; null when it can. Every app's name is one label under it, so it must not be HQ's or
 * the files address's name, nor have either directly under it, where the wildcard would take it.
 */
export function previewDomainProblem(domain: string, hosts: { hqHost: string; filesHost: string | null }): string | null {
  const d = normalisePreviewDomain(domain)
  if (d.length > MAX_DOMAIN_LENGTH) return 'it is longer than a preview address may be'
  if (/^[0-9.]+$/.test(d) || d.includes(':')) return 'it is a network address, and every live app needs a name of its own under a domain'
  if (d === 'localhost' || d.endsWith('.localhost') || d === 'local' || d.endsWith('.local')) return 'only this machine or its network can reach it'
  if (!parsePreviewPattern(previewPatternForDomain(d))) return 'it is not a domain name, such as preview.example.com'
  if (/^\d+$/.test(d.slice(d.lastIndexOf('.') + 1))) return 'it is not a domain name, such as preview.example.com'
  const named = [{ host: hosts.hqHost.toLowerCase(), what: "HQ's" }, ...(hosts.filesHost ? [{ host: hosts.filesHost.toLowerCase(), what: "uploaded files'" }] : [])]
  for (const { host, what } of named) {
    if (host === d) return `it is ${what} own address, and live apps need one of their own`
    const dot = host.indexOf('.')
    if (dot > 0 && host.slice(dot + 1) === d) return `${what} address ${host} is directly under it, so live apps would take its name`
  }
  return null
}

/**
 * Where the front door asks hq, through hq-web, whether a name under the preview domain may have a certificate, before
 * it asks a certificate authority for one (on-demand TLS): `GET <path>?domain=<name>`, answered 200 only for an app hq
 * has recorded and for the check name.
 */
export const PREVIEW_CERTIFICATE_ASK_PATH = '/preview-certificate-ask'
