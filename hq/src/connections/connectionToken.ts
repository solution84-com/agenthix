import crypto from 'node:crypto'
import { hashCredential } from '../sites/credentials'

/** Every connection token starts with this, so a leaked one is recognisable for what it is. */
export const CONNECTION_TOKEN_PREFIX = 'ahx_conn_'

/** How many leading characters are kept to tell connections apart; never enough to use. */
const DISPLAY_PREFIX_LENGTH = CONNECTION_TOKEN_PREFIX.length + 6

/** A new token, shown once; only its SHA-256 is stored (adr-0090). */
export function generateConnectionToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `${CONNECTION_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
  return { token, tokenHash: hashCredential(token), tokenPrefix: token.slice(0, DISPLAY_PREFIX_LENGTH) }
}

export function looksLikeConnectionToken(value: string): boolean {
  return value.startsWith(CONNECTION_TOKEN_PREFIX) && value.length > CONNECTION_TOKEN_PREFIX.length
}
