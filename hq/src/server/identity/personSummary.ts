/**
 * How a person is named wherever they appear (every screen reviewed spec §3,
 * People; adr-0100): their display name, else their login name; their login
 * name as the @handle; their picture; and whether they are still here, have
 * left, or have been erased. An erased person is "Former member", with no
 * handle and no picture. Pure: `people.ts` reads the rows.
 */
export type PersonState = 'active' | 'left' | 'erased'

export type PersonSummary = {
  userId: string
  name: string
  /** The login name, without the @; null once erased. */
  handle: string | null
  avatarUrl: string | null
  /** Their cover; null for an erased person. */
  coverUrl?: string | null
  state: PersonState
}

export const FORMER_MEMBER = 'Former member'

export type PersonRow = {
  id: string
  displayName: string | null
  avatarUrl: string | null
  coverUrl?: string | null
  deactivatedAt: Date | null
  erasedAt: Date | null
  auth: { identities: { providerUserId: string }[] } | null
}

export const PERSON_SELECT = {
  id: true,
  displayName: true,
  avatarUrl: true,
  coverUrl: true,
  deactivatedAt: true,
  erasedAt: true,
  auth: { select: { identities: { where: { providerName: 'username' }, select: { providerUserId: true } } } },
} as const

export function personState(row: Pick<PersonRow, 'deactivatedAt' | 'erasedAt'>): PersonState {
  if (row.erasedAt) return 'erased'
  return row.deactivatedAt ? 'left' : 'active'
}

export function personSummary(row: PersonRow): PersonSummary {
  const state = personState(row)
  if (state === 'erased') return { userId: row.id, name: FORMER_MEMBER, handle: null, avatarUrl: null, coverUrl: null, state }
  const handle = row.auth?.identities[0]?.providerUserId ?? null
  const name = row.displayName?.trim() || handle || row.id.slice(0, 8)
  return { userId: row.id, name, handle, avatarUrl: row.avatarUrl, coverUrl: row.coverUrl ?? null, state }
}

/** A person id with no row at all reads as a former member too: shared work outlives every account. */
export function missingPerson(userId: string): PersonSummary {
  return { userId, name: FORMER_MEMBER, handle: null, avatarUrl: null, coverUrl: null, state: 'erased' }
}

/** A display name as stored: trimmed, at most 80 characters, and null when blank. */
export const DISPLAY_NAME_MAX = 80

export function normaliseDisplayName(input: unknown): string | null {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string') throw new TypeError('A name must be text')
  const trimmed = input.trim().replace(/\s+/g, ' ')
  if (trimmed === '') return null
  if (trimmed.length > DISPLAY_NAME_MAX) throw new RangeError(`A name is at most ${DISPLAY_NAME_MAX} characters`)
  return trimmed
}
