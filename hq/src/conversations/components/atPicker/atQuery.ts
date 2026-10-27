/**
 * The pure parts of the message box's `@` picker (spec part 3, *Chips in conversations*): where an `@` being typed
 * starts and what follows it, and the picker's groups as data, so agents and people can join as groups of their own.
 */
import { FIND_FILES_MAX_FRAGMENT } from '@agenthix/core'

export type AtQuery = { start: number; end: number; fragment: string }

/**
 * The `@…` the caret is at the end of: an `@` at the start of the text or after a space or line break, then no space
 * up to the caret. Null when there is none, or what follows is longer than a site takes.
 */
export function atQueryAt(text: string, caret: number | null): AtQuery | null {
  if (caret === null || caret > text.length) return null
  const before = text.slice(0, caret)
  const match = /(^|\s)@(\S*)$/.exec(before)
  if (!match) return null
  const fragment = match[2]
  if (fragment.length > FIND_FILES_MAX_FRAGMENT || fragment.includes('@')) return null
  return { start: caret - fragment.length - 1, end: caret, fragment }
}

export type PickerItem = {
  id: string
  /** What the chosen item puts into the box. */
  reference: string
  label: string
  detail: string
}

export type PickerGroup = { id: 'files'; heading: string; items: PickerItem[] }

export type PlaceFiles = {
  name: string
  state: 'ready' | 'not-answering'
  files: { reference: string; name: string; folder: string }[]
}

/** The groups the picker lists, and the places that didn't answer. A place's name is beside a file only when there are several. */
export function pickerGroups(places: PlaceFiles[]): { groups: PickerGroup[]; away: string[] } {
  const several = places.length > 1
  const items = places.flatMap(place => place.files.map(file => ({
    id: `files:${file.reference}`,
    reference: file.reference,
    label: file.name,
    detail: several ? `${place.name} · ${file.folder}` : file.folder,
  })))
  return {
    groups: items.length > 0 ? [{ id: 'files', heading: 'Files', items }] : [],
    away: places.filter(p => p.state === 'not-answering').map(p => p.name),
  }
}

export const itemsOf = (groups: PickerGroup[]): PickerItem[] => groups.flatMap(g => g.items)
