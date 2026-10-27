/**
 * `location.findFiles` (site protocol 1.8): a location's files whose names hold a fragment, best first — what the
 * message box's `@` picker shows as the person types. The contract and its bounds are core's
 * (`protocol/locationFind.ts`); hq checked the person's access before it asked (adr-0042).
 *
 * ## Confinement
 *
 * The location's root is opened through `openInLocation`, the containment every location method shares. Below it the
 * walk never follows a symbolic link: a link is neither listed nor entered, so a link out of the location, and a link
 * loop, are simply not there. Each directory is opened with `O_NOFOLLOW` and its descriptor confirmed to be the entry
 * a link-free walk from the root finds (`openResolved`), then read through that descriptor, so a directory swapped for
 * a link after the walk saw it lists nothing of where the link points. Where the descriptor does not pin the directory
 * (macOS), it is confirmed again after reading, and a directory that fails is dropped.
 *
 * ## Bounds
 *
 * At most `FIND_FILES_MAX_ENTRIES` entries looked at, `FIND_FILES_MAX_MS` spent and `FIND_FILES_MAX_DEPTH` folders
 * deep; at any bound the walk stops and answers what it has, with `truncated`. An answer names paths relative to the
 * location, never one on this disk.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants, type Dirent } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  FIND_FILES_MAX_DEPTH, FIND_FILES_MAX_ENTRIES, FIND_FILES_MAX_FRAGMENT, FIND_FILES_MAX_MS, FIND_FILES_MAX_RESULTS,
  FIND_FILES_SKIPPED_FOLDERS, LOCATION_FILE_METHODS, LocationFileError,
  type Exact, type FoundFile, type FoundFileMatch, type LocationFindFilesParams, type LocationFindFilesResult,
} from '@agenthix/core'
import { openInLocation, parseParams } from './locationContainment'
import { LOC_REF_SCHEMA } from './locationFileMethods'
import { DESCRIPTOR_PATHS_PINNED, confirmDescriptor, descriptorPath, openResolved } from '../../agents/runtime/containedFile'

export const FIND_FILES_PARAMS_SHAPE = { loc: LOC_REF_SCHEMA, fragment: z.string().max(FIND_FILES_MAX_FRAGMENT * 2) }
const findFilesParams = z.object(FIND_FILES_PARAMS_SHAPE)
const _wireMirrorsCore: Exact<z.infer<typeof findFilesParams>, LocationFindFilesParams> = true
void _wireMirrorsCore

export interface FindLimits {
  maxEntries: number
  maxMs: number
  maxDepth: number
  maxResults: number
  now: () => number
}

const LIMITS: FindLimits = {
  maxEntries: FIND_FILES_MAX_ENTRIES, maxMs: FIND_FILES_MAX_MS, maxDepth: FIND_FILES_MAX_DEPTH,
  maxResults: FIND_FILES_MAX_RESULTS, now: Date.now,
}

const RANK: Record<FoundFileMatch, number> = { starts: 0, contains: 1, recent: 2 }
const SKIPPED = new Set(FIND_FILES_SKIPPED_FOLDERS)

function matchOf(name: string, needle: string): FoundFileMatch | null {
  if (!needle) return 'recent'
  const lower = name.toLowerCase()
  if (lower.startsWith(needle)) return 'starts'
  return lower.includes(needle) ? 'contains' : null
}

function best(a: FoundFile, b: FoundFile): number {
  return RANK[a.match] - RANK[b.match] || b.modifiedAt.localeCompare(a.modifiedAt) || a.path.localeCompare(b.path)
}

/** One directory's entries, read through its confirmed descriptor; null when it cannot be read or confirmed. */
async function readConfirmed(realRoot: string, rel: string): Promise<{ dir: string; dirents: Dirent[]; close: () => Promise<void> } | null> {
  const realTarget = rel ? path.join(realRoot, ...rel.split('/')) : realRoot
  let handle
  try {
    handle = await openResolved({ realRoot, realTarget }, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY, 'outside')
  } catch {
    return null
  }
  const close = () => handle.close().catch(() => {})
  try {
    const dir = descriptorPath(handle, realTarget)
    const dirents = await fs.readdir(dir, { withFileTypes: true })
    if (!DESCRIPTOR_PATHS_PINNED) await confirmDescriptor(handle, realRoot, realTarget, 'outside')
    return { dir, dirents, close }
  } catch {
    await close()
    return null
  }
}

/**
 * The walk itself, below a root whose real path the caller has confirmed. Breadth first, so shallow files are found
 * before a deep tree uses up the bounds.
 */
export async function findBelow(realRoot: string, fragment: string, limits: FindLimits = LIMITS): Promise<LocationFindFilesResult> {
  const needle = fragment.trim().toLowerCase().slice(0, FIND_FILES_MAX_FRAGMENT)
  const started = limits.now()
  const found: FoundFile[] = []
  const queue: { rel: string; depth: number }[] = [{ rel: '', depth: 0 }]
  let seen = 0
  let truncated = false

  walk: while (queue.length > 0) {
    const { rel, depth } = queue.shift()!
    const read = await readConfirmed(realRoot, rel)
    if (!read) continue
    try {
      for (const dirent of read.dirents) {
        if (++seen > limits.maxEntries || limits.now() - started > limits.maxMs) { truncated = true; break walk }
        if (dirent.isSymbolicLink()) continue
        const childRel = rel ? `${rel}/${dirent.name}` : dirent.name
        if (dirent.isDirectory()) {
          if (SKIPPED.has(dirent.name)) continue
          if (depth + 1 > limits.maxDepth) { truncated = true; continue }
          queue.push({ rel: childRel, depth: depth + 1 })
          continue
        }
        if (!dirent.isFile()) continue
        const match = matchOf(dirent.name, needle)
        if (!match) continue
        const stat = await fs.lstat(path.join(read.dir, dirent.name)).catch(() => null)
        if (!stat?.isFile()) continue
        found.push({
          path: childRel, name: dirent.name, folder: rel, kind: 'file', size: stat.size,
          modifiedAt: stat.mtime.toISOString(), match,
        })
      }
    } finally {
      await read.close()
    }
  }

  found.sort(best)
  return { files: found.slice(0, limits.maxResults), truncated }
}

export async function findFiles(params: unknown, limits: FindLimits = LIMITS): Promise<LocationFindFilesResult> {
  const method = LOCATION_FILE_METHODS.findFiles
  const { loc, fragment } = parseParams(findFilesParams, params, method)
  if (fragment.trim().length > FIND_FILES_MAX_FRAGMENT) {
    throw new LocationFileError('invalid', `${method} takes a name fragment of at most ${FIND_FILES_MAX_FRAGMENT} characters`)
  }
  let opened
  try {
    opened = await openInLocation(loc, method, null, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY)
  } catch (err) {
    // A location whose disk has not been made yet holds no files, as its listing says.
    if (err instanceof LocationFileError && err.code === 'not_found') return { files: [], truncated: false }
    throw err
  }
  const { handle, realRoot } = opened
  await handle.close().catch(() => {})
  return findBelow(realRoot, fragment, limits)
}
