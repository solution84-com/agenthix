import type { LibraryAssetRow, LibraryKindId, LibraryStatus } from './types'

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
  const what = kind === 'board' || kind === 'task-template' ? 'project' : kind
  if (kind === 'board' || kind === 'task-template') return made === 0 ? 'Not used yet' : `Used by ${made} ${what}${made === 1 ? '' : 's'}`
  return made === 0 ? 'None made from it yet' : `${made} ${what}${made === 1 ? '' : 's'} made from it`
}

/** A template's folder name as a title: `sprint-board` is "Sprint board". */
export function titleOfName(name: string): string {
  const spaced = name.replace(/-/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** What needs the person: a proposal to review, an update waiting, a draft to finish, a skill no agent uses. */
export const NEEDS_YOU: readonly LibraryStatus[] = ['waiting', 'update', 'draft', 'noAgent']

/** An entry needs the person by its own states and by those of the copy or original shown under it. */
export const needsYou = (r: LibraryAssetRow) =>
  NEEDS_YOU.some(s => r.statuses.includes(s) || r.partners.some(p => p.statuses.includes(s)))

export const NO_AGENT_USES_IT = 'No agent uses it'

/** "No agent uses it", "1 agent uses it", "2 agents use it". */
export function usedByText(count: number): string {
  if (count === 0) return NO_AGENT_USES_IT
  return count === 1 ? '1 agent uses it' : `${count} agents use it`
}

function originWords(r: LibraryAssetRow): string {
  if (r.builtIn) return 'Built in'
  if (r.signer === 'Signed by Agenthix') return 'From Agenthix'
  return r.signer
}

/** A row's one line of state, in words: who made it, its version, who uses it, and what it needs from the person. */
export function rowStateWords(r: LibraryAssetRow): string {
  if (r.proposalId) return [r.proposedBy, 'Needs a review'].filter(Boolean).join(' · ')
  const parts: string[] = [originWords(r)]
  if (r.kind === 'skill') {
    if (r.version) parts.push(`version ${r.version}`)
    if (r.builtIn) parts.push('every agent working in a repository')
    else if (!r.statuses.includes('setAside')) parts.push(r.everyAgent ? 'every agent uses it' : usedByText(r.agentCount))
  } else {
    parts.push(!r.madeCount ? 'not used yet' : `${r.madeCount} in use`)
  }
  if (r.setAsideFor) parts.push(`Set aside, replaced by your copy ${r.setAsideFor}`)
  if (r.updateTo) parts.push(`Update available · ${r.updateTo}`)
  if (r.statuses.includes('draft')) parts.push(r.draftBy ? `Draft by ${r.draftBy} · Edit to finish it` : 'Draft · Edit to finish it')
  for (const p of r.partners) {
    if (p.relation === 'original') parts.push(`Your copy of ${p.words}, which is set aside`)
    else parts.push(`Your copy ${p.words} ${p.statuses.includes('setAside') ? 'is set aside' : "isn't published yet"}`)
    if (p.statuses.includes('draft')) parts.push(p.draftBy ? `Draft of your copy by ${p.draftBy}` : 'Draft of your copy')
  }
  if (r.builtIn && r.switchedOff) parts.push('switched off')
  return parts.join(' · ')
}

/** A card's second line: who made it, then its version ("Built in to HQ", "Made here · 1.1.0", "From Agenthix · 1.0.0"). */
export function cardPublisherWords(r: LibraryAssetRow): string {
  if (r.proposalId) return r.proposedBy ?? 'Proposed'
  if (r.builtIn) return 'Built in to HQ'
  return [originWords(r), r.version].filter(Boolean).join(' · ')
}

export type CardTag = { label: string; needsYou: boolean; lock?: boolean }

/** The one tag at a card's foot: what needs the person, else that it is built in, else none. */
export function cardTag(r: LibraryAssetRow): CardTag | null {
  if (r.proposalId) return { label: 'Needs a review', needsYou: true }
  if (r.updateTo) return { label: `Update ${r.updateTo}`, needsYou: true }
  if (r.statuses.includes('draft') || r.partners.some(p => p.statuses.includes('draft'))) return { label: 'Draft · finish it', needsYou: true }
  if (r.statuses.includes('setAside')) return { label: 'Set aside', needsYou: false }
  if (r.statuses.includes('noAgent')) return { label: 'No agent yet', needsYou: true }
  if (r.builtIn) return { label: 'Built in', needsYou: false, lock: true }
  return null
}
