/**
 * The keys backups are sealed to (adr-0112). The machine's own is 32 random bytes in the state folder, held by
 * the host service. A person's — for the backup location, or an export — is 120 random bits shown once as six
 * groups of four characters (Crockford's base 32: no I, L, O or U, so nothing reads as another), and the machine
 * keeps only the public key made from it.
 */
import crypto from 'node:crypto'
import type { StateFolder } from '../state/folder'
import { holderFrom, type Holder } from './seal'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const KEY_BYTES = 15
const KEY_CHARS = 24
const MACHINE_KEY = ['backups', 'machine-key.json']

/** A new key for a person: its words and the public key the machine keeps. */
export function newPersonKey(): { words: string; publicKey: Buffer } {
  const bytes = crypto.randomBytes(KEY_BYTES)
  return { words: keyWords(bytes), publicKey: holderFrom(bytes).publicKey }
}

export function keyWords(bytes: Buffer): string {
  let bits = 0
  let acc = 0
  let out = ''
  for (const b of bytes) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += ALPHABET[(acc >> bits) & 31]
    }
    acc &= (1 << bits) - 1
  }
  return out.match(/.{4}/g)!.join('-')
}

/**
 * A key as a person types it back: any case, with or without dashes and spaces, the letters that look like digits
 * read as those digits. Null when it is not a key at all.
 */
export function parseKeyWords(typed: string): Buffer | null {
  const clean = typed.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
  if (clean.length !== KEY_CHARS) return null
  const out = Buffer.alloc(KEY_BYTES)
  let bits = 0
  let acc = 0
  let o = 0
  for (const c of clean) {
    const v = ALPHABET.indexOf(c)
    if (v < 0) return null
    acc = (acc << 5) | v
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >> bits) & 0xff
      acc &= (1 << bits) - 1
    }
  }
  return out
}

/** The machine's own backup key, made on first use and never shown. */
export function machineHolder(state: StateFolder): Holder {
  const stored = state.readJson(...MACHINE_KEY) as { key?: unknown } | null
  if (stored && typeof stored.key === 'string' && /^[0-9a-f]{64}$/.test(stored.key)) return holderFrom(Buffer.from(stored.key, 'hex'))
  if (stored) throw new Error(`${state.path(...MACHINE_KEY)} does not hold a key the host service reads; it is left as it is.`)
  const key = crypto.randomBytes(32)
  state.writeJson(MACHINE_KEY, { key: key.toString('hex') })
  return holderFrom(key)
}

/** A location's key as it is given to restore with: the words a person was shown, or the 32 bytes Cloud keeps, base64url. */
export function parseLocationKey(typed: string): Buffer | null {
  const trimmed = typed.trim()
  if (/^[A-Za-z0-9_-]{43}$/.test(trimmed)) {
    const bytes = Buffer.from(trimmed, 'base64url')
    if (bytes.length === 32) return bytes
  }
  return parseKeyWords(typed)
}
