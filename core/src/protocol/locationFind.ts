/**
 * Finding a place's files by name, on the control channel: what the message box's `@` picker asks
 * a site as the person types. The site walks the one location it is named, never following a symbolic link and
 * skipping `FIND_FILES_SKIPPED_FOLDERS`, and stops at `FIND_FILES_MAX_ENTRIES` entries or `FIND_FILES_MAX_MS`,
 * answering what it has found by then with `truncated` set. hq checks the person's access to the place before it asks;
 * the params carry no person (adr-0042).
 *
 * The answer is paths relative to the location, at most `FIND_FILES_MAX_RESULTS`, best first: a name that starts with
 * the fragment, then one that contains it, each the most recently changed first. An empty fragment answers the most
 * recently changed files. Matching is case-insensitive on the file's own name, not its folder.
 */
import type { LocationRef } from '../storage/locationRef.js'

export const FIND_FILES_MAX_RESULTS = 20
/** The longest fragment a site takes; a longer one is refused `invalid`. */
export const FIND_FILES_MAX_FRAGMENT = 100
/** The most directory entries one find looks at before it stops and answers. */
export const FIND_FILES_MAX_ENTRIES = 20_000
/** The longest one find walks before it stops and answers. */
export const FIND_FILES_MAX_MS = 1_500
/** The deepest folder one find walks into, counted from the location. */
export const FIND_FILES_MAX_DEPTH = 12
/** Folders a find never walks into: a repository's own, and installed packages no one picks a file from. */
export const FIND_FILES_SKIPPED_FOLDERS: readonly string[] = ['.git', 'node_modules']

export interface LocationFindFilesParams {
  loc: LocationRef
  /** The name fragment, as typed; the site trims it. */
  fragment: string
}

/** How a file matched: its name starts with the fragment, contains it, or (an empty fragment) it changed recently. */
export type FoundFileMatch = 'starts' | 'contains' | 'recent'

export interface FoundFile {
  /** Relative to the location, forward-slashed. */
  path: string
  /** The file's own name. */
  name: string
  /** The folder it is in, relative to the location; empty for the location itself. */
  folder: string
  kind: 'file'
  size: number
  /** ISO. */
  modifiedAt: string
  match: FoundFileMatch
}

export interface LocationFindFilesResult {
  files: FoundFile[]
  /** The walk stopped at a bound, so a better match may lie in what it did not reach. */
  truncated: boolean
}
