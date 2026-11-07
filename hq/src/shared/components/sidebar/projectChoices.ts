import { movedOrder } from '../../../pins/pinOrder'
import type { PlaceNav } from '../../layouts/placeNavTypes'

/** A project as Find a project and the Projects list read it from `getProjects`. */
export interface ProjectChoice {
  id: string
  key: string
  name: string
  isMember: boolean
  /** Your space: it has its own place in the navigation, so it is never offered here. */
  personalSpace?: boolean
}

export interface PinRef {
  /** The pin's own id; only reordering needs it. */
  id?: string
  kind: string
  itemId: string
}

/** The ids of the person's pinned projects, in the order they set. */
export function pinnedProjectIds(pins: PinRef[]): string[] {
  return pins.filter((p) => p.kind === 'PROJECT').map((p) => p.itemId)
}

/** Rows split into the pinned ones, in the pins' order, and the rest, in the order given. */
export function splitPinned<T extends { id: string }>(rows: T[], pinnedIds: string[]): { pinned: T[]; rest: T[] } {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const pinned = pinnedIds.map((id) => byId.get(id)).filter((r): r is T => !!r)
  const held = new Set(pinned.map((r) => r.id))
  return { pinned, rest: rows.filter((r) => !held.has(r.id)) }
}

/**
 * What Find a project lists: the projects the person works in (not your space), pinned first in their order, then the
 * others A–Z, each narrowed to the names that hold the search.
 */
export function findProjectGroups(projects: ProjectChoice[], pins: PinRef[], search: string): { pinned: ProjectChoice[]; others: ProjectChoice[] } {
  const words = search.trim().toLowerCase()
  const mine = projects.filter((p) => p.isMember && !p.personalSpace && (!words || p.name.toLowerCase().includes(words)))
  const { pinned, rest } = splitPinned(mine, pinnedProjectIds(pins))
  return { pinned, others: [...rest].sort((a, b) => a.name.localeCompare(b.name)) }
}

/** A project's address on the same section as the one shown, so switching keeps the person's place. */
export function projectAt(key: string, section: string | null): string {
  return `/projects/${key}${section && section !== 'overview' ? `?tool=${encodeURIComponent(section)}` : ''}`
}

/**
 * Every pin's id in the new order once a pinned project moves one place earlier (-1) or later (1) among the pinned
 * projects; the other pins keep their places. Null when it cannot move that way.
 */
export function movedProjectPin(pins: PinRef[], projectId: string, step: -1 | 1): string[] | null {
  const projects = pins.filter((p) => p.kind === 'PROJECT')
  const at = projects.findIndex((p) => p.itemId === projectId)
  const moved = projects[at]?.id
  const target = projects[at + step]?.id
  if (at === -1 || !moved || !target) return null
  const ids = pins.map((p) => p.id).filter((id): id is string => !!id)
  return movedOrder(ids, moved, target)
}

/** A project or your space switches project from its name; an agent's page is not a project, so its name only opens it. */
export const switchesProject = (nav: Pick<PlaceNav, 'kind'>) => nav.kind !== 'agent'
