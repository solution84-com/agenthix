import type { LibraryKindId } from './types'

/** "Ada has it", "Ada and Sam have it", "Ada, Sam and 2 more have it". */
export function whoHasText(names: string[]): string {
  if (names.length === 0) return 'No agent has it yet'
  if (names.length === 1) return `${names[0]} has it`
  if (names.length === 2) return `${names[0]} and ${names[1]} have it`
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} have it`
  return `${names[0]}, ${names[1]} and ${names.length - 2} more have it`
}

/** "Signed by Acme (github.com/acme)": the name the administrator gave, then where the signer says it is. */
export function signedByText(displayName: string, repository: string | null): string {
  const where = repository ? repository.replace(/^[a-z]+:\/\//, '').replace(/\.git$/, '') : null
  return where ? `Signed by ${displayName} (${where})` : `Signed by ${displayName}`
}

/** What a template says about what was made from it. */
export function madeFromText(kind: Exclude<LibraryKindId, 'skill'>, made: number): string {
  const what = kind === 'board' ? 'project' : kind
  if (kind === 'board') return made === 0 ? 'Not used yet' : `Used by ${made} ${what}${made === 1 ? '' : 's'}`
  return made === 0 ? 'None made from it yet' : `${made} ${what}${made === 1 ? '' : 's'} made from it`
}

/** A template's folder name as a title: `sprint-board` is "Sprint board". */
export function titleOfName(name: string): string {
  const spaced = name.replace(/-/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
