import { samePlace, type PlaceRef } from './startPlace'

/** A place in the new conversation's list: your space, or a project the person is a member of. */
export interface PlaceRow {
  ref: PlaceRef
  /** Stable across renders: `space`, or the project's id. */
  id: string
  name: string
}

export interface PlaceGroup {
  label: string
  rows: PlaceRow[]
}

export interface ProjectRow { id: string; key: string; name: string; isMember: boolean; personalOwnerId: string | null }
export interface PinRow { kind: string; itemId: string }

export const SPACE_ROW: PlaceRow = { ref: { kind: 'space' }, id: 'space', name: 'Your space' }

export const PLACE_EXPLANATION = {
  space: 'Private to you. Works in your own files.',
  project: "A project. Works in its files, with its agents. Others in it can see it's running, not what's said.",
} as const

/** The places a conversation can start in: the projects the person is a member of, apart from personal ones. */
export function memberProjects(projects: ProjectRow[]): PlaceRow[] {
  return projects
    .filter((p) => p.isMember && !p.personalOwnerId)
    .map((p) => ({ ref: { kind: 'project', key: p.key }, id: p.id, name: p.name }))
}

/**
 * The list grouped as the board draws it (spec §10): *You're here* (the place the canvas is on, then your space
 * when that is a project), *Pinned* (pinned projects, in the person's order), *All projects* (the rest, A–Z).
 * Each place appears once.
 */
export function groupPlaces(here: PlaceRow, projects: PlaceRow[], pins: PinRow[]): PlaceGroup[] {
  const hereRows = here.ref.kind === 'space' ? [here] : [here, SPACE_ROW]
  const byId = new Map(projects.map((p) => [p.id, p]))
  const pinned = pins
    .filter((p) => p.kind === 'PROJECT')
    .map((p) => byId.get(p.itemId))
    .filter((p): p is PlaceRow => !!p && p.id !== here.id)
  const taken = new Set([here.id, ...pinned.map((p) => p.id)])
  const rest = projects.filter((p) => !taken.has(p.id)).sort((a, b) => a.name.localeCompare(b.name))
  return [
    { label: "You're here", rows: hereRows },
    { label: 'Pinned', rows: pinned },
    { label: 'All projects', rows: rest },
  ].filter((g) => g.rows.length > 0)
}

/**
 * While searching (the board's second state): the places whose name holds the query, in list order, then the
 * selected place under *Selected* when it is not among them, so it never goes out of view.
 */
export function searchPlaces(groups: PlaceGroup[], query: string, selected: PlaceRef): { groups: PlaceGroup[]; matched: boolean } {
  const q = query.trim().toLowerCase()
  const all = groups.flatMap((g) => g.rows)
  const matches = all.filter((r) => r.name.toLowerCase().includes(q))
  const chosen = all.find((r) => samePlace(r.ref, selected))
  const out: PlaceGroup[] = []
  if (matches.length > 0) out.push({ label: 'Matches', rows: matches })
  if (chosen && !matches.includes(chosen)) out.push({ label: 'Selected', rows: [chosen] })
  return { groups: out, matched: matches.length > 0 }
}
