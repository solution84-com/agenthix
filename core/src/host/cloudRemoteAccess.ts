/**
 * Remote access to the Fleet Console on a machine Agenthix Cloud runs (pre-release spec B9, ADR-0132): the checks of
 * what Cloud's controller sends, shared by the host service, which checks before it acts, and the Fleet Console,
 * which checks again before it listens. Pure, so the screens may read it too; nothing here opens a socket.
 *
 * On an organisation's own machine none of this applies: `mayTurnOnRemoteAccess` (cloud.ts) still holds there.
 */
import type { CloudOnlyRequest } from './cloudOperations.js'
import { REMOTE_ACCESS_MAX_MS } from './cloud.js'
import { SERVICE_PORTS } from '../ports/ports.js'

/** At most this many addresses may reach it at once. */
export const CLOUD_REMOTE_ACCESS_ALLOW_MAX = 20
/** The Fleet Console's own ports (its page in dev, its server), which remote access never takes. */
const CONSOLE_LOCAL_PORTS: readonly number[] = [SERVICE_PORTS.console.web, SERVICE_PORTS.console.server]
/** A little slack for the two clocks, Cloud's and the machine's, when `until` is checked against the 8 hours. */
const CLOCK_SLACK_MS = 60_000

export type RemoteAccessOnRequest = Extract<CloudOnlyRequest, { op: 'remoteAccess.on' }>
export type RemoteAuthenticatorRequest = Extract<CloudOnlyRequest, { op: 'remoteAccess.authenticator.add' }>

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string }

/** An address that may connect: one IPv4 address (`/32`), or one IPv6 `/64` network. `network` is canonical. */
export type RemoteAllowEntry = { family: 4; network: string; prefix: 32 } | { family: 6; network: string; prefix: 64 }

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/** The eight 16-bit groups of an IPv6 address, or null. No zone, no embedded IPv4. */
export function ipv6Groups(text: string): number[] | null {
  if (!/^[0-9a-f:]{2,39}$/i.test(text)) return null
  const halves = text.split('::')
  if (halves.length > 2) return null
  const part = (s: string) => (s === '' ? [] : s.split(':'))
  const head = part(halves[0]!)
  const tail = halves.length === 2 ? part(halves[1]!) : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.some(g => !/^[0-9a-f]{1,4}$/i.test(g))) return null
  return groups.map(g => parseInt(g, 16))
}

/** RFC 5952's form: lowercase, no leading zeros, the longest run of two or more zero groups as `::`. */
export function ipv6Text(groups: number[]): string {
  let best = { at: -1, length: 0 }
  for (let i = 0; i < 8;) {
    if (groups[i] !== 0) { i++; continue }
    let j = i
    while (j < 8 && groups[j] === 0) j++
    if (j - i > best.length && j - i >= 2) best = { at: i, length: j - i }
    i = j
  }
  const hex = groups.map(g => g.toString(16))
  if (best.at < 0) return hex.join(':')
  return `${hex.slice(0, best.at).join(':')}::${hex.slice(best.at + best.length).join(':')}`
}

/** `203.0.113.7/32` or `2001:db8:1:2::/64`; for IPv6 the low 64 bits are set to zero. Null for anything else. */
export function parseRemoteAllowEntry(text: unknown): RemoteAllowEntry | null {
  if (typeof text !== 'string' || text.length > 64) return null
  const slash = text.lastIndexOf('/')
  if (slash < 0) return null
  const address = text.slice(0, slash)
  const prefix = text.slice(slash + 1)
  if (prefix === '32' && IPV4.test(address)) return { family: 4, network: address, prefix: 32 }
  if (prefix !== '64') return null
  const groups = ipv6Groups(address)
  if (!groups) return null
  return { family: 6, network: ipv6Text([...groups.slice(0, 4), 0, 0, 0, 0]), prefix: 64 }
}

export const allowEntryText = (e: RemoteAllowEntry): string => `${e.network}/${e.prefix}`

/** A DNS name for the certificate: lowercase letters, digits and hyphens, at least two labels, no wildcard. */
export function isRemoteAccessName(name: unknown): name is string {
  if (typeof name !== 'string' || name.length > 253) return false
  const labels = name.split('.')
  return labels.length >= 2 && labels.every(l => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) && !/^\d+$/.test(labels[labels.length - 1]!)
}

/** A port the Fleet Console may listen on for remote access: not a privileged one (80 and 443 among them), not its own. */
export function remoteAccessPortProblem(port: unknown): string | null {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535) {
    return 'The port must be a whole number from 1024 to 65535; 80 and 443 are never taken.'
  }
  if (CONSOLE_LOCAL_PORTS.includes(port)) return `Port ${port} is the Fleet Console's own, on its machine only.`
  return null
}

/** `until`: later than now, and no later than host management allows remote access to run (8 hours). */
export function remoteAccessUntilProblem(until: unknown, now: Date): string | null {
  const at = typeof until === 'string' ? Date.parse(until) : NaN
  if (Number.isNaN(at)) return 'The end time is not a time.'
  if (at <= now.getTime()) return 'The end time has passed.'
  if (at - now.getTime() > REMOTE_ACCESS_MAX_MS + CLOCK_SLACK_MS) return 'Remote access runs for 8 hours at most.'
  return null
}

const PEM_CERTIFICATE = /^(-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*)+$/
const MAX_CHAIN = 32 * 1024

/** Everything `remoteAccess.on` carries, checked and rebuilt; `allow` canonical and without repeats. */
export function checkRemoteAccessOn(r: Record<string, unknown>, now: Date): Checked<RemoteAccessOnRequest> {
  if (!isRemoteAccessName(r.name)) return { ok: false, message: 'The name is not a DNS name.' }
  const portProblem = remoteAccessPortProblem(r.port)
  if (portProblem) return { ok: false, message: portProblem }
  if (typeof r.certificate !== 'string' || r.certificate.length > MAX_CHAIN || !PEM_CERTIFICATE.test(r.certificate.trim() + '\n')) {
    return { ok: false, message: 'The certificate is not a PEM certificate chain.' }
  }
  const untilProblem = remoteAccessUntilProblem(r.until, now)
  if (untilProblem) return { ok: false, message: untilProblem }
  if (!Array.isArray(r.allow) || r.allow.length < 1 || r.allow.length > CLOUD_REMOTE_ACCESS_ALLOW_MAX) {
    return { ok: false, message: `Name from 1 to ${CLOUD_REMOTE_ACCESS_ALLOW_MAX} addresses that may connect.` }
  }
  const allow: string[] = []
  for (const raw of r.allow) {
    const entry = parseRemoteAllowEntry(raw)
    if (!entry) return { ok: false, message: `${JSON.stringify(raw).slice(0, 70)} is not an IPv4 /32 or an IPv6 /64.` }
    const text = allowEntryText(entry)
    if (!allow.includes(text)) allow.push(text)
  }
  return {
    ok: true,
    value: {
      op: 'remoteAccess.on', name: r.name as string, port: r.port as number, certificate: (r.certificate as string).trim() + '\n',
      until: new Date(Date.parse(r.until as string)).toISOString(), allow,
    },
  }
}

const BASE32 = /^[A-Z2-7]+=*$/
const SHA256_HEX = /^[0-9a-f]{64}$/
const AUTHENTICATOR_ID = /^[A-Za-z0-9_-]{1,64}$/
/** How long an authenticator may wait to be claimed: Cloud hands it to a person to set up, so days, not months. */
export const AUTHENTICATOR_CLAIM_MAX_MS = 30 * 24 * 60 * 60_000

/** A TOTP secret in base32 (RFC 4648), 128 to 512 bits. */
export function isTotpSecret(secret: unknown): secret is string {
  if (typeof secret !== 'string') return false
  const s = secret.replace(/\s+/g, '').toUpperCase()
  if (!BASE32.test(s)) return false
  const bits = s.replace(/=+$/, '').length * 5
  return bits >= 128 && bits <= 512 + 4
}

/** Everything `remoteAccess.authenticator.add` carries, checked and rebuilt. */
export function checkRemoteAuthenticator(r: Record<string, unknown>, now: Date): Checked<RemoteAuthenticatorRequest> {
  if (typeof r.id !== 'string' || !AUTHENTICATOR_ID.test(r.id)) return { ok: false, message: 'The authenticator\'s id is not valid.' }
  if (!isTotpSecret(r.secret)) return { ok: false, message: 'The secret is not a base32 TOTP secret of 128 bits or more.' }
  const hashes = r.recoveryCodeHashes
  if (!Array.isArray(hashes) || hashes.length !== 10 || hashes.some(h => typeof h !== 'string' || !SHA256_HEX.test(h)) ||
    new Set(hashes).size !== hashes.length) {
    return { ok: false, message: 'Give the SHA-256 of 10 different recovery codes, in lowercase hex.' }
  }
  const before = typeof r.claimBefore === 'string' ? Date.parse(r.claimBefore) : NaN
  if (Number.isNaN(before) || before <= now.getTime()) return { ok: false, message: 'The time to claim it by has passed, or is not a time.' }
  if (before - now.getTime() > AUTHENTICATOR_CLAIM_MAX_MS) return { ok: false, message: 'It must be claimed within 30 days.' }
  return {
    ok: true,
    value: {
      op: 'remoteAccess.authenticator.add', id: r.id, secret: (r.secret as string).replace(/\s+/g, '').toUpperCase().replace(/=+$/, ''),
      recoveryCodeHashes: hashes as string[], claimBefore: new Date(before).toISOString(),
    },
  }
}
