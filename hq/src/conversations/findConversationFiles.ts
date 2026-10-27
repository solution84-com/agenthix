/**
 * What the message box's `@` picker lists (spec part 3, *Chips in conversations*): the files of the conversation's
 * place whose names hold what the person typed, found by the place's site (`location.findFiles`), each with the
 * reference Mention would put in. Read-only: nothing is signed or recorded, and it answers while hq is read-only.
 *
 * The person's access to the place is checked before its site is asked, as a file's open checks it; a place they
 * can't read is left out without a word. A site that doesn't answer leaves its place out with a note, never an error
 * for the whole picker.
 *
 * Only the conversation's own place is searched: a reference in a conversation (`files/…`) is read in its own place's
 * folder, so a file of an added place would be named as a file of the own place.
 */
import { HttpError } from 'wasp/server'
import {
  FIND_FILES_MAX_FRAGMENT, LOCATION_FILE_METHODS,
  type LocationFindFilesResult, type LocationRef, type SiteFileRef,
} from '@agenthix/core'
import { assertLocationAccess } from '../storage/locationAccess'
import { resolveStorageSite } from '../storage/storageSite'
import { siteChannelRegistry } from '../sites/channel'
import { referenceOf } from '../storage/pages/fileReferences'
import { requireConversationReader } from './readingRule'
import { ownPlace, placeKey, summaries, type Place } from './places'

/** Short: a person is typing, and a site this slow is as good as away. The site's own walk stops well before. */
export const FIND_FILES_TIMEOUT_MS = 5_000

export type FoundPlaceFile = {
  /** What Mention puts into the box: `files/reports/q3.pdf`. */
  reference: string
  name: string
  /** The reference's folder: `files/reports`. */
  folder: string
  modifiedAt: string
}
export type PlaceFilesFound = {
  name: string
  state: 'ready' | 'not-answering'
  files: FoundPlaceFile[]
  truncated: boolean
}
export type FindConversationFilesArgs = { conversationId: string; fragment: string }
export type FindConversationFilesResult = { places: PlaceFilesFound[] }

export interface FindConversationFilesDeps {
  placesOf(conversationId: string, userId: string): Promise<{ place: Place; name: string }[]>
  /** Throws when the person may not read the location. */
  checkAccess(loc: LocationRef, userId: string): Promise<void>
  /** Throws when the site can't be reached or doesn't answer. */
  find(loc: LocationRef, fragment: string): Promise<LocationFindFilesResult>
}

const filesOf = (place: Place): LocationRef =>
  ({ ownerType: place.type === 'user' ? 'user' : 'project', ownerId: place.id, workspaceId: null, taskId: null })

function found(loc: LocationRef, result: LocationFindFilesResult): FoundPlaceFile[] {
  return result.files.flatMap(f => {
    const ref: SiteFileRef = { space: 'place', loc, path: f.path }
    const reference = referenceOf(ref)
    if (!reference) return []
    return [{ reference, name: f.name, folder: reference.slice(0, -(f.name.length + 1)), modifiedAt: f.modifiedAt }]
  })
}

export async function findConversationFiles(
  args: FindConversationFilesArgs, userId: string, deps: FindConversationFilesDeps,
): Promise<FindConversationFilesResult> {
  const places = await deps.placesOf(args.conversationId, userId)
  const answers = await Promise.all(places.map(async ({ place, name }): Promise<PlaceFilesFound | null> => {
    const loc = filesOf(place)
    try {
      await deps.checkAccess(loc, userId)
    } catch {
      return null
    }
    try {
      const result = await deps.find(loc, args.fragment)
      return { name, state: 'ready', files: found(loc, result), truncated: result.truncated }
    } catch {
      return { name, state: 'not-answering', files: [], truncated: false }
    }
  }))
  return { places: answers.filter((a): a is PlaceFilesFound => a !== null) }
}

export const findConversationFilesDeps: FindConversationFilesDeps = {
  async placesOf(conversationId, userId) {
    const ref = await requireConversationReader(conversationId, userId)
    const own = await ownPlace({ id: ref.id, home: ref.home, projectId: ref.projectId, openedById: ref.openedById })
    if (!own) return []
    const named = await summaries([own])
    return [{ place: own, name: named.get(placeKey(own))?.name ?? '' }]
  },
  checkAccess: (loc, userId) => assertLocationAccess(loc, userId, 'read'),
  async find(loc, fragment) {
    const siteId = await resolveStorageSite(loc)
    return siteChannelRegistry.request(siteId, LOCATION_FILE_METHODS.findFiles, { loc, fragment }, FIND_FILES_TIMEOUT_MS)
  },
}

type Ctx = { user?: { id: string } | null }

export const findConversationFilesQuery = async (args: FindConversationFilesArgs, context: Ctx): Promise<FindConversationFilesResult> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const conversationId = args?.conversationId
  const fragment = typeof args?.fragment === 'string' ? args.fragment.trim() : null
  if (typeof conversationId !== 'string' || conversationId.length === 0 || conversationId.length > 100) {
    throw new HttpError(400, 'Say which conversation to find files for. Nothing was changed.')
  }
  if (fragment === null || fragment.length > FIND_FILES_MAX_FRAGMENT) {
    throw new HttpError(400, `A file's name is found by up to ${FIND_FILES_MAX_FRAGMENT} characters of it. Nothing was changed.`)
  }
  return findConversationFiles({ conversationId, fragment }, context.user.id, findConversationFilesDeps)
}
