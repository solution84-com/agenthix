import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'
import { masterKeyProblem } from '../server/crypto/secretCrypto'

/**
 * The cookie a preview host issues once a ticket is redeemed (adr-0071): who
 * is viewing, which preview, until when — signed, so the preview's own script
 * or anyone else cannot write one.
 *
 * It is bound to the preview's host alone (no `Domain` attribute) and HttpOnly,
 * so the previewed page can neither read it nor send it anywhere else. It is
 * not the whole check: every request still re-runs the requester check, so
 * ending a preview or losing access to its storage refuses the next request
 * even while the cookie is unexpired.
 */
export const PREVIEW_COOKIE = 'agenthix_preview'

export interface PreviewClaim {
  userId: string
  previewId: string
  /** Milliseconds since the epoch. */
  exp: number
}

/**
 * Derived from SECRETS_MASTER_KEY, the key hq already refuses to start without,
 * under a label of its own — so it is never the key that encrypts stored
 * secrets, and rotating that key ends every preview cookie with it.
 */
export function previewCookieKey(raw: string | undefined = process.env.SECRETS_MASTER_KEY): Buffer {
  const problem = masterKeyProblem(raw)
  if (problem) throw new Error(problem)
  return Buffer.from(hkdfSync('sha256', Buffer.from(raw as string, 'base64'), Buffer.alloc(0), 'agenthix preview cookie v1', 32))
}

function mac(key: Buffer, body: string): string {
  return createHmac('sha256', key).update(body).digest('base64url')
}

export function signPreviewClaim(claim: PreviewClaim, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(claim)).toString('base64url')
  return `${body}.${mac(key, body)}`
}

export type ClaimCheck =
  | { ok: true; claim: PreviewClaim }
  | { ok: false; reason: 'missing' | 'expired' | 'invalid' }

/**
 * `expired` is a genuine cookie that has run out, answered like a missing one
 * (go and get another); `invalid` is a forged, altered, or other preview's
 * cookie, which is refused outright.
 */
export function checkPreviewClaim(value: string | undefined, previewId: string, key: Buffer, now = Date.now()): ClaimCheck {
  if (!value) return { ok: false, reason: 'missing' }
  const [body, sig, extra] = value.split('.')
  if (!body || !sig || extra !== undefined) return { ok: false, reason: 'invalid' }
  const want = Buffer.from(mac(key, body))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'invalid' }
  let claim: PreviewClaim
  try {
    claim = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (typeof claim?.userId !== 'string' || typeof claim.exp !== 'number' || claim.previewId !== previewId) {
    return { ok: false, reason: 'invalid' }
  }
  if (claim.exp <= now) return { ok: false, reason: 'expired' }
  return { ok: true, claim }
}

/** One cookie's value out of a Cookie header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}

/** The Cookie header with one cookie removed, or undefined when nothing is left. */
export function withoutCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  const kept = header
    .split(';')
    .map(p => p.trim())
    .filter(p => p && p.slice(0, p.indexOf('=') < 0 ? p.length : p.indexOf('=')).trim() !== name)
  return kept.length ? kept.join('; ') : undefined
}

export function previewSetCookie(value: string, exp: number, secure: boolean, now = Date.now()): string {
  const maxAge = Math.max(0, Math.floor((exp - now) / 1000))
  return `${PREVIEW_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}
