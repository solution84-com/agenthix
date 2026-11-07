import { useQuery, getPins } from 'wasp/client/operations'
import { CHAT_PATH } from '../chat/chatComposer'
import { SPACE_PATH } from '../chat/chatPlacePaths'
import type { InboxPlace } from '../shared/conversations/inbox'
import { SPACE_REF, type PlaceRef } from './startPlace'

/** A place in the chat's bar: the person's own space, or a pinned project. */
export interface PinnedPlace {
  /** `space`, or the project's id. */
  id: string
  /** For the conversations list: null is the person's own space. */
  placeId: string | null
  ref: PlaceRef
  name: string
  /** The place itself, opened in the canvas. */
  href: string
  /** Where its conversations live, for opening one in the dock. */
  basePath: string
}

export const SPACE_PLACE: PinnedPlace = { id: 'space', placeId: null, ref: SPACE_REF, name: 'Your space', href: SPACE_PATH, basePath: CHAT_PATH }

export interface Pin { kind: string; itemId: string; name: string; href: string }

const PROJECT_HREF = /^\/projects\/([^/]+)$/

/** Your space first, then the pinned projects in the person's order (pins of boards and agents are not places to talk in). */
export function pinnedPlacesOf(pins: Pin[]): PinnedPlace[] {
  const projects = pins.flatMap((p): PinnedPlace[] => {
    const key = p.kind === 'PROJECT' ? PROJECT_HREF.exec(p.href)?.[1] : undefined
    if (!key) return []
    const path = `/projects/${key}`
    return [{ id: p.itemId, placeId: p.itemId, ref: { kind: 'project', key: decodeURIComponent(key) }, name: p.name, href: path, basePath: path }]
  })
  return [SPACE_PLACE, ...projects]
}

export function usePinnedPlaces(): PinnedPlace[] {
  const { data } = useQuery(getPins)
  return pinnedPlacesOf((data ?? []) as Pin[])
}

/** Where a conversation's row opens it from: its place's list. */
export function basePathOf(place: InboxPlace): string {
  return place.kind === 'space' ? CHAT_PATH : `/projects/${encodeURIComponent(place.key)}`
}

/** The place a conversation lives in, as the bar's tiles name it. */
export function placeIdOf(place: InboxPlace): string {
  return place.kind === 'space' ? 'space' : place.id
}
