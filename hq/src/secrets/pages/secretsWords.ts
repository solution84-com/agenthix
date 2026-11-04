import type { SecretView } from './secretsTypes'

/** Largest value a secret holds (the server's rule, `rules.ts`), in bytes. */
export const SECRET_FILE_BYTES_MAX = 48 * 1024

const NAME = /^[A-Z][A-Z0-9_]*$/

/** The first thing wrong with a name as typed, or null. The server has the full rules and refuses with its own words. */
export function nameProblem(name: string): string | null {
  if (!name) return 'Give it a name.'
  if (!NAME.test(name)) return 'Capitals, digits and _, starting with a capital.'
  return null
}

export const KIND_WORDS: Record<SecretView['kind'], string> = { text: 'Text', file: 'File', from_github: 'From GitHub' }

export function dayWords(d: Date | string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** What the Changed column says about rotation: a week before the date *Rotate by*, after it *Overdue*. */
export function rotationWords(s: Pick<SecretView, 'rotation' | 'rotateBy'>): { words: string; tone: 'warning' | 'danger' | 'neutral' } | null {
  if (s.rotation === 'overdue') return { words: 'Overdue', tone: 'danger' }
  if (!s.rotateBy) return null
  return { words: `Rotate by ${dayWords(s.rotateBy)}`, tone: s.rotation === 'due_soon' ? 'warning' : 'neutral' }
}

/** Who issues a secret and where to get a new one, for the row; null when neither is known. */
export function sourceWords(s: Pick<SecretView, 'issuer' | 'renewAt'>): string | null {
  const parts = [s.issuer.trim() && `Issued by ${s.issuer.trim()}`, s.renewAt.trim() && `New one: ${s.renewAt.trim()}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export function usedByWords(names: string[]): string {
  return names.length ? names.join(', ') : 'Not used'
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Why a chosen file can't be a secret, or null. */
export function fileProblem(size: number): string | null {
  if (size === 0) return 'That file is empty.'
  if (size > SECRET_FILE_BYTES_MAX) return `That file is ${Math.ceil(size / 1024)} KB; a secret holds at most 48 KB.`
  return null
}

export const RECORD_WORDS = {
  set: 'Set',
  replaced: 'Replaced',
  deleted: 'Deleted',
  used: 'Used by a run',
  printed: 'A run printed it; masking caught it',
  turned_off_users: 'Workflows using it were turned off',
} as const
