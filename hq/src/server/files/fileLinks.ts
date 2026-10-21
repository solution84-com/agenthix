/**
 * Short-lived signed links to uploaded files (host-management spec §16, adr-0114). HQ makes one for one file and
 * one person; the files origin serves it to whoever holds it until it expires, and checks again that the person
 * named in it may read the file. Nothing in a link is a session: the files origin never sees HQ's.
 *
 * A link's expiry is rounded up to the next five minutes, so links HQ makes for the same file and person in the
 * same few minutes are the same address and a browser's cache holds one copy. A link lives five to ten minutes.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const LINK_LIFETIME_S = 300
const ROUND_S = 300

export type LinkGrant = {
  /** The file's path on the files origin, each segment as stored (not URL-encoded). */
  path: string
  /** Who it was made for; null for a file shown before sign-in. */
  userId: string | null
  /** Served as a download even where it could be shown. */
  download: boolean
}

export type LinkCheck = { ok: true; grant: LinkGrant } | { ok: false; reason: 'unsigned' | 'expired' | 'tampered' }

let processKey: Buffer | null = null

/**
 * The signing key, derived from a secret every deployed HQ has. Without one — a developer's machine with no
 * setting — a key of this process alone, so links stop working when it restarts, which is harmless.
 */
function signingKey(env: NodeJS.ProcessEnv): Buffer {
  const secret = env.JWT_SECRET || env.SECRETS_MASTER_KEY
  if (secret) return createHmac('sha256', secret).update('uploaded-file-links/v1').digest()
  processKey ??= randomBytes(32)
  return processKey
}

function signature(grant: LinkGrant, expires: number, env: NodeJS.ProcessEnv): string {
  const message = ['v1', grant.path, grant.userId ?? '', String(expires), grant.download ? 'd' : 'i'].join('\n')
  return createHmac('sha256', signingKey(env)).update(message).digest('base64url')
}

/** The path's segments URL-encoded, as a link carries them. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** A request's path back to its stored form, or null when it does not decode. */
export function decodePath(path: string): string | null {
  try {
    return path.split('/').map(decodeURIComponent).join('/')
  } catch {
    return null
  }
}

export function makeLink(origin: string, grant: LinkGrant, now: Date, env: NodeJS.ProcessEnv = process.env) {
  const expires = Math.ceil((now.getTime() / 1000 + LINK_LIFETIME_S) / ROUND_S) * ROUND_S
  const query = new URLSearchParams({ u: grant.userId ?? '', e: String(expires) })
  if (grant.download) query.set('d', '1')
  query.set('s', signature(grant, expires, env))
  return { url: `${origin}${encodePath(grant.path)}?${query}`, expiresAt: new Date(expires * 1000).toISOString() }
}

type Query = Record<string, unknown>

const one = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Checks a request to the files origin against the link it carries. */
export function checkLink(path: string, query: Query, now: Date, env: NodeJS.ProcessEnv = process.env): LinkCheck {
  const sig = one(query.s)
  const user = one(query.u)
  const expiresText = one(query.e)
  if (!sig || user === null || !expiresText) return { ok: false, reason: 'unsigned' }
  const expires = /^\d{1,12}$/.test(expiresText) ? Number(expiresText) : NaN
  if (!Number.isFinite(expires)) return { ok: false, reason: 'tampered' }
  const grant: LinkGrant = { path, userId: user || null, download: one(query.d) === '1' }
  const expected = Buffer.from(signature(grant, expires, env))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'tampered' }
  // Checked after the signature, so an expired link is only ever told apart from a forged one when it was real.
  if (expires * 1000 <= now.getTime()) return { ok: false, reason: 'expired' }
  return { ok: true, grant }
}
