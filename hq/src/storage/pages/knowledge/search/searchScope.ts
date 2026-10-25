export type SearchScope = 'this' | 'org' | 'both'

export const SCOPES: Array<{ value: SearchScope; label: string }> = [
  { value: 'this', label: 'This project' },
  { value: 'org', label: 'Organisation' },
  { value: 'both', label: 'Both' },
]

/** A person's own space has no project; the switch's first choice reads for the place the person is in. */
export const scopesFor = (personal: boolean) => SCOPES.map(s => (s.value === 'this' && personal ? { ...s, label: 'Your space' } : s))

export const DEFAULT_SCOPE: SearchScope = 'both'

export interface SearchHit {
  level: string
  page: string
  title: string
  description?: string
  matches: Array<{ line: number; text: string }>
}

/** Where a result is from, as the result says it. */
export const hitFrom = (hit: SearchHit, personal: boolean): string =>
  hit.level === 'org' ? 'Organisation' : personal ? 'Your space' : 'This project'
