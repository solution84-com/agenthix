/**
 * What hq may ask this site about an owner's `artefacts/` and `knowledge/` —
 * the folders beside its `files/` that no `LocationRef` names (core's
 * `LOCATION_FILE_METHODS.listArtefacts` says why they are addressed by the
 * owner). The two listings are control-channel methods, registered in
 * `../hq/channelMethods.ts`; the two reads stream on the content transport,
 * served by `../hq/content/locationReadHandler.ts` against the schemas here.
 *
 * The rules are `./locationFileMethods.ts`'s: params carry an owner and a path
 * and no user id (hq checks entitlement first; ADR-0042), arrive as `unknown`
 * and are parsed through `parseParams`, and nothing that leaves names a path
 * on this disk. Containment is `openInOwnerFolder`'s, which refuses every link.
 *
 * Both listings show regular files only. A link is not followed and not
 * listed, so a listing never offers an entry its read would refuse.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants, type Dirent } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  KNOWLEDGE_LIST_MAX_DEPTH,
  KNOWLEDGE_LIST_MAX_FILES,
  LOCATION_FILE_METHODS,
  LocationFileError,
  WORKSPACE_OWNER_TYPES,
  type Exact,
  type LocationListArtefactsParams,
  type LocationListArtefactsResult,
  type LocationListKnowledgeParams,
  type LocationListKnowledgeResult,
  type LocationReadArtefactParams,
  type LocationReadKnowledgeParams,
  type OwnerFolderFile,
  type StorageOwnerRef,
} from '@agenthix/core'
import { describeOwnerFolder, openInOwnerFolder, parseParams, type OwnerFolder } from './locationContainment'
import {
  DESCRIPTOR_PATHS_PINNED,
  confirmDescriptor,
  descriptorPath,
  openResolved,
  type FileHandle,
} from '../../agents/runtime/containedFile'

const ownerShape = { ownerType: z.enum(WORKSPACE_OWNER_TYPES), ownerId: z.string().min(1) }

/**
 * An artefact is one file directly in `artefacts/`, so it is named, never
 * pathed: no separator, and not `.` or `..`.
 */
const artefactName = z
  .string()
  .min(1)
  .refine(name => !name.includes('/') && !name.includes('\\') && name !== '.' && name !== '..')

export const listArtefactsParams = z.object(ownerShape)
export const readArtefactParams = z
  .object({ ...ownerShape, name: artefactName, maxBytes: z.number().int().nonnegative() })
export const listKnowledgeParams = z.object(ownerShape)
export const readKnowledgeParams = z
  .object({ ...ownerShape, relPath: z.string().min(1), maxBytes: z.number().int().nonnegative() })

/** Pinned against core's types, as `./locationFileMethods.ts` pins its own. */
const _wireMirrorsCore: [
  Exact<z.infer<typeof listArtefactsParams>, LocationListArtefactsParams>,
  Exact<z.infer<typeof readArtefactParams>, LocationReadArtefactParams>,
  Exact<z.infer<typeof listKnowledgeParams>, LocationListKnowledgeParams>,
  Exact<z.infer<typeof readKnowledgeParams>, LocationReadKnowledgeParams>,
] = [true, true, true, true]
void _wireMirrorsCore

function newestFirst(a: OwnerFolderFile, b: OwnerFolderFile): number {
  return b.modifiedAt.localeCompare(a.modifiedAt) || a.path.localeCompare(b.path)
}

/**
 * One directory's entries, read through its open descriptor. `realDir` is the
 * directory's link-free real path, already confirmed by the open; on a platform
 * where the descriptor does not pin the directory, it is confirmed again after
 * the read, so a directory swapped for a link meanwhile lists nothing.
 */
async function readDirectory(
  handle: FileHandle,
  realRoot: string,
  realDir: string,
  fail: () => LocationFileError,
): Promise<{ dir: string; dirents: Dirent[] }> {
  const dir = descriptorPath(handle, realDir)
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true })
    if (!DESCRIPTOR_PATHS_PINNED) await confirmDescriptor(handle, realRoot, realDir, 'outside')
    return { dir, dirents }
  } catch {
    throw fail()
  }
}

/** A folder that is not there yet is empty: nothing has been written to it. */
async function openFolder(owner: StorageOwnerRef, folder: OwnerFolder, method: string) {
  try {
    return await openInOwnerFolder(owner, folder, method, '', fsConstants.O_RDONLY | fsConstants.O_DIRECTORY)
  } catch (err) {
    if (err instanceof LocationFileError && err.code === 'not_found') return null
    throw err
  }
}

/** The files directly in `artefacts/`, newest first. */
export async function listArtefacts(params: unknown): Promise<LocationListArtefactsResult> {
  const method = LOCATION_FILE_METHODS.listArtefacts
  const owner = parseParams(listArtefactsParams, params, method)
  const opened = await openFolder(owner, 'artefacts', method)
  if (!opened) return { entries: [] }
  const { handle, realRoot, realTarget } = opened
  try {
    const fail = () => new LocationFileError('outside', `${method} in ${describeOwnerFolder(owner, 'artefacts')}`)
    const { dir, dirents } = await readDirectory(handle, realRoot, realTarget, fail)
    const entries = await Promise.all(
      dirents.filter(d => d.isFile()).map(async (d): Promise<OwnerFolderFile | null> => {
        const stat = await fs.lstat(path.join(dir, d.name)).catch(() => null)
        return stat?.isFile() ? { path: d.name, size: stat.size, modifiedAt: stat.mtime.toISOString() } : null
      }),
    )
    return { entries: entries.filter((e): e is OwnerFolderFile => e !== null).sort(newestFirst) }
  } finally {
    await handle.close().catch(() => {})
  }
}

/**
 * Every regular file under `knowledge/`, newest first, walked breadth-first
 * and bounded (`KNOWLEDGE_LIST_MAX_FILES`, `KNOWLEDGE_LIST_MAX_DEPTH`).
 *
 * Hidden entries and links are skipped. Each directory below the folder is
 * opened the way the folder is — not following a link, and confirmed by a
 * link-free walk — before it is read, so a directory an agent swaps for a link
 * between being listed and being read is refused rather than walked into.
 */
export async function listKnowledge(params: unknown): Promise<LocationListKnowledgeResult> {
  const method = LOCATION_FILE_METHODS.listKnowledge
  const owner = parseParams(listKnowledgeParams, params, method)
  const opened = await openFolder(owner, 'knowledge', method)
  if (!opened) return { files: [], truncated: false }
  const { realRoot } = opened
  const files: OwnerFolderFile[] = []
  let truncated = false
  const queue: { rel: string; depth: number; handle: FileHandle | null }[] = [{ rel: '', depth: 0, handle: opened.handle }]

  while (queue.length && !truncated) {
    const next = queue.shift()!
    const realDir = path.join(realRoot, next.rel)
    let handle = next.handle
    if (!handle) {
      handle = await openResolved(
        { realRoot, realTarget: realDir }, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY, 'outside',
      ).catch(() => null)
      if (!handle) continue
    }
    try {
      const fail = () => new LocationFileError('outside', `${method} "${next.rel || '.'}" in ${describeOwnerFolder(owner, 'knowledge')}`)
      // The folder itself failing is the listing failing; a directory below it
      // that fails is left out, as a link there is.
      const read = await readDirectory(handle, realRoot, realDir, fail).catch((err: unknown) => {
        if (!next.rel) throw err
        return null
      })
      if (!read) continue
      const { dir, dirents } = read
      for (const d of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
        if (d.name.startsWith('.')) continue
        const rel = next.rel ? `${next.rel}/${d.name}` : d.name
        if (d.isDirectory()) {
          if (next.depth + 1 < KNOWLEDGE_LIST_MAX_DEPTH) queue.push({ rel, depth: next.depth + 1, handle: null })
          continue
        }
        if (!d.isFile()) continue
        if (files.length >= KNOWLEDGE_LIST_MAX_FILES) {
          truncated = true
          break
        }
        const stat = await fs.lstat(path.join(dir, d.name)).catch(() => null)
        if (stat?.isFile()) files.push({ path: rel, size: stat.size, modifiedAt: stat.mtime.toISOString() })
      }
    } finally {
      await handle.close().catch(() => {})
    }
  }
  for (const rest of queue) await rest.handle?.close().catch(() => {})
  return { files: files.sort(newestFirst), truncated }
}
