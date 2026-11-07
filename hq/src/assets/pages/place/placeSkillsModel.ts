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

/** Whether the skill needs the person: found or changed in files, and off with no decision about it as it is now. */
export function needsYou(s: PlaceSkillView): boolean {
  return !s.gone && !s.setAsideReason && s.state === 'off' && !s.switchHolds
}

/** The header's counts: what is on, and what needs the person. Someone who may not switch skills is not counted as needed. */
export function pageCounts(skills: PlaceSkillView[], may?: Pick<PlaceSkillsData['may'], 'settings'>): { on: number; needYou: number; setAside: number } {
  const live = skills.filter((s) => !s.gone)
  return {
    on: live.filter((s) => !s.setAsideReason && s.state === 'on').length,
    needYou: may && !may.settings ? 0 : live.filter(needsYou).length,
    setAside: live.filter((s) => s.setAsideReason).length,
  }
}

export function countsLine(c: { on: number; needYou: number; setAside: number }): string {
  return [`${c.on} on`, c.needYou ? `${c.needYou} need you` : null, c.setAside ? `${c.setAside} set aside` : null].filter(Boolean).join(' · ')
}

/** A row's state as one sentence: what the skill is, and whether it is on or what it is off until. */
export function stateLine(s: PlaceSkillView): string {
  if (s.gone) return 'Gone from the files'
  if (s.setAsideReason) return 'Set aside · not used here'
  const on = s.state === 'on'
  if (s.group === 'WORKSPACE') return `Found in the repository's ${repositoryFolder(s)} · read-only · ${on ? 'on' : 'off until you switch it on'}`
  if (s.status === 'changed') {
    return on ? `Its files changed since version ${s.newestVersion} · on` : 'Its files changed · off until you look at the change'
  }
  if (s.status === 'unpublished') return on ? "Found in this place's files · on" : "Found in this place's files · off until you publish it"
  const where = on ? (s.group === 'PLACE' ? 'on for every agent here' : 'on') : 'off'
  if (s.origin) {
    const copy = `A copy of ${s.origin.identity} ${s.origin.version} from the Library`
    return `${copy} · ${where}${s.libraryUpdate ? ` · ${s.libraryUpdate} available` : ' · stays at this version'}`
  }
  return `Version ${s.version} · ${where}`
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

export type RowAction = 'seeChange' | 'publish' | 'update' | 'read'

/** The one action a row offers beside its state, if any; the rest of what a person may do is in ⋯. */
export function primaryAction(s: PlaceSkillView, may: PlaceSkillsData['may']): RowAction | null {
  const a = rowActions(s, may)
  if (a.changes) return 'seeChange'
  if (a.publish) return 'publish'
  if (a.update) return 'update'
  if (a.read) return 'read'
  return null
}
