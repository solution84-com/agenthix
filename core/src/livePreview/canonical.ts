/**
 * The canonical encoding of what a live preview's declarations are hashed by: one `name=value` line per field, in the
 * order the caller gives, each value written by `JSON.stringify` (a string, null, a whole number, or a list of pairs). JSON's escaping
 * keeps a value on its line, so no value can pass for another field, and the same fields always give the same bytes.
 * The checks refuse what must never be named: an empty id, a path that climbs out, a hash that is not one.
 */
import { utf8 } from '../host/crypto/webCrypto.js'

type Value = string | number | null | [string, string][]

export function canonicalLines(fields: [string, Value][]): Uint8Array {
  return utf8(fields.map(([name, value]) => `${name}=${JSON.stringify(value)}\n`).join(''))
}

const MAX_TEXT = 1024

export function checkText(value: string, what: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_TEXT) throw new Error(`The ${what} is not valid.`)
  return value
}

/** A path inside a copy: relative, `/`-separated, no empty, `.` or `..` segment, no backslash or control character. */
export function checkPath(value: string): string {
  const ok = typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT && !value.startsWith('/') &&
    !/[\\\u0000-\u001f\u007f]/.test(value) && value.split('/').every(s => s !== '' && s !== '.' && s !== '..')
  if (!ok) throw new Error('A path is not one inside the working copy.')
  return value
}

export function checkSha256(value: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('A content hash is not SHA-256 in lower-case hex.')
  return value
}
