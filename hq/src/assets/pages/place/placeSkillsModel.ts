/**
 * What a place's Skills page shows and says (skills spec part 6 *A place's Skills page*; boards P1, P2). Pure: the
 * view comes from `getPlaceSkills`, cast at the boundary, and this turns it into groups, counts and the words a row
 * carries, so the screen only draws them.
 */
import type { PlaceSkillView } from '../../places/list'

export type { PlaceSkillView }

export type PlaceDefaultValue = 'ON' | 'OFF' | 'NEVER'

export type PlaceSkillsData = {
  defaults: { placeDefault: PlaceDefaultValue | null; orgDefault: PlaceDefaultValue; effective: PlaceDefaultValue }
  skills: PlaceSkillView[]
  may: Record<'editDraft' | 'publish' | 'rollBack' | 'remove' | 'install' | 'settings', boolean>
}

export const DEFAULT_WORDS: Record<PlaceDefaultValue, { title: string; says: string }> = {
  ON: { title: 'On by default', says: 'Everything found runs; switch off what you don\'t want.' },
  OFF: { title: 'Off by default', says: 'Everything found is listed and stays off until switched on. A changed skill goes off again.' },
  NEVER: { title: 'Never', says: 'Agents here use only installed skills; files and repositories aren\'t read.' },
}

const STRICTNESS: Record<PlaceDefaultValue, number> = { ON: 0, OFF: 1, NEVER: 2 }

/** A place may only be stricter than the organisation (adr-0072): a looser choice is greyed out with this reason. */
export function looserThanOrganisation(choice: PlaceDefaultValue, org: PlaceDefaultValue): string | null {
  return STRICTNESS[choice] < STRICTNESS[org]
    ? `The organisation's is ${DEFAULT_WORDS[org].title.toLowerCase()}, and a project can be stricter, never looser.`
    : null
}

export type SkillGroup = {
  /** Stable key: `place`, `agent:<id>` or `workspace:<id>`. */
  key: string
  kind: 'PLACE' | 'AGENT' | 'WORKSPACE'
  agentId: string | null
  workspaceId: string | null
  skills: PlaceSkillView[]
}

const ORDER = { PLACE: 0, AGENT: 1, WORKSPACE: 2 } as const

/** The page's groups: the place's own, then each agent's, then each workspace's, skills by name inside. */
export function groupSkills(skills: PlaceSkillView[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>()
  for (const s of skills) {
    const key = s.group === 'PLACE' ? 'place' : s.group === 'AGENT' ? `agent:${s.agentId}` : `workspace:${s.workspaceId}`
    const group = groups.get(key) ?? { key, kind: s.group, agentId: s.agentId, workspaceId: s.workspaceId, skills: [] }
    group.skills.push(s)
    groups.set(key, group)
  }
  const out = [...groups.values()]
  for (const g of out) g.skills.sort((a, b) => skillTitle(a).localeCompare(skillTitle(b)))
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.key.localeCompare(b.key))
}

/** The folder name, which is what a skill is called when its files give no name. */
export const folderName = (s: Pick<PlaceSkillView, 'path'>): string => s.path.split('/').pop() ?? s.path
export const skillTitle = (s: Pick<PlaceSkillView, 'name' | 'path'>): string => s.name.trim() || folderName(s)

/** Where a group's folders are, as the board writes them under its heading. */
export function groupFolders(kind: SkillGroup['kind'], agentId: string | null): string {
  if (kind === 'PLACE') return 'files/.agents/skills/'
  if (kind === 'AGENT') return `files/.agents/agents/${agentId}/skills/`
  return '.claude/skills/ · .agents/skills/ · .github/skills/'
}

/** A repository skill's folder, from its path `workspace/<id>/<folder>/<name>`. */
export const repositoryFolder = (s: Pick<PlaceSkillView, 'path' | 'workspaceId'>): string => {
  const rest = s.path.replace(`workspace/${s.workspaceId}/`, '')
  return rest.slice(0, rest.lastIndexOf('/'))
}

export type Waiting = 'new' | 'changed' | null

/** Whether nobody has decided about the skill as it is now: found or changed in files, and off. */
export function isWaiting(s: PlaceSkillView): boolean {
  return !s.gone && !s.setAsideReason && s.state === 'off' && !s.switchHolds
}

export function pageCounts(skills: PlaceSkillView[]): { on: number; waiting: number; setAside: number } {
  const live = skills.filter((s) => !s.gone)
  return {
    on: live.filter((s) => !s.setAsideReason && s.state === 'on').length,
    waiting: live.filter(isWaiting).length,
    setAside: live.filter((s) => s.setAsideReason).length,
  }
}

export function countsLine(c: { on: number; waiting: number; setAside: number }): string {
  return [`${c.on} on`, c.waiting ? `${c.waiting} waiting` : null, c.setAside ? `${c.setAside} set aside` : null].filter(Boolean).join(' · ')
}

/** The state words of a row, in the order the board writes them. */
export function stateWords(s: PlaceSkillView): string[] {
  if (s.gone) return ['gone from the files']
  const out: string[] = []
  if (s.group === 'WORKSPACE') out.push('repository · read-only')
  else if (s.version !== null) out.push(`version ${s.version}`)
  if (s.origin) out.push(`based on ${s.origin.identity} ${s.origin.version}`)
  if (s.libraryUpdate) out.push(`${s.libraryUpdate} available`)
  if (s.setAsideReason) out.push('set aside')
  else if (s.group !== 'WORKSPACE') {
    if (s.status === 'changed') out.push('changed in files, not published')
    else if (s.status === 'unpublished') out.push('in files, not published')
    if (s.state === 'off' && !s.switchHolds) out.push('off')
  }
  return out
}

/** What the person is told a skill is waiting for, under its name. */
export function waitingNote(s: PlaceSkillView): string | null {
  if (s.setAsideReason) return s.setAsideReason
  if (s.group === 'WORKSPACE' || s.gone || s.state === 'on') return null
  if (s.status === 'changed') return 'Off until someone publishes it or puts the published version back (off by default).'
  if (s.status === 'unpublished') return 'Not run until published and switched on.'
  return null
}

/** Finding 16: a switch that stopped holding because the files changed says so, for a published skill and one never published. */
export function switchedOffNote(s: PlaceSkillView): string | null {
  if (s.gone || s.setAsideReason || s.switch !== 'ON' || s.switchHolds || s.state === 'on') return null
  const who = s.switchedBy ?? 'someone'
  const when = s.switchedAt ? `, ${new Date(s.switchedAt).toLocaleDateString()}` : ''
  return `Switched off: its files changed since ${who} switched it on${when}.`
}

/** What *Remove* says the person loses: only what a published version holds can be put back. */
export function removeNote(s: Pick<PlaceSkillView, 'status' | 'newestVersion'>): string {
  const deletes = "This deletes the skill's folder from the place's files."
  if (s.newestVersion === null) return `${deletes} It was never published, so it can't be put back.`
  if (s.status === 'changed') {
    return `${deletes} The change made since version ${s.newestVersion} was never published and can't be put back. Version ${s.newestVersion} stays in the history.`
  }
  return `${deletes} Its published versions stay in the history, so it can be put back.`
}

export const nextVersion = (s: Pick<PlaceSkillView, 'newestVersion'>): number => (s.newestVersion ?? 0) + 1

/** What a person may do with a row: workspace skills switch only; a gone skill only its history and its put back. */
export function rowActions(s: PlaceSkillView, may: PlaceSkillsData['may']) {
  const place = s.group !== 'WORKSPACE'
  const live = !s.gone
  const aside = !!s.setAsideReason
  return {
    switch: may.settings && live && !aside,
    read: live && s.status !== 'published',
    publish: may.publish && place && live && !aside && s.status !== 'published',
    putBack: may.publish && place && s.status === 'changed' && s.newestVersion !== null,
    changes: place && live && (s.status === 'changed' || switchedOffNote(s) !== null),
    history: place && s.newestVersion !== null,
    edit: may.editDraft && place && live && !aside,
    remove: may.remove && place && live,
    /** F3: an offer of the Library's newer version, to whoever publishes here. */
    update: may.publish && place && live && !aside && s.libraryUpdate !== null,
  }
}
