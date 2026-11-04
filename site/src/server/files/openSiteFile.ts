/**
 * One file on this site, named in any of the spaces a site serves (`SiteFileRef`), opened for reading through the
 * same confinement as every read of that space:
 *
 *  - a place's file: `openInLocation`, which resolves links on both sides and refuses a real path outside the place;
 *  - an artefact: `openInOwnerFolder` on the owner's `artefacts/`, which refuses every link;
 *  - a knowledge page or kept version: `openKnowledgeForRead`, which refuses `..`, absolute names and every link.
 *
 * The file is opened once and the descriptor is what is then read and stat'ed, so a link swapped in after the check
 * cannot redirect it. What `file.about` answers and what `files.serve` streams both come through here, so the two can
 * never disagree about which file a name means.
 *
 * A file with more than one hard link is refused as not found: a hard link is the same file as one somewhere else,
 * possibly outside the place, and no path check can tell which of its names is the real one. That refusal is for what
 * a person is shown: `location.readFile` and `location.readArtefact`, which hq reads for its own use through the same
 * containment, do not make it, and a hard link cannot leave the owner's folder an agent mounts, so they reach no
 * further than the agent could copy.
 */
import { constants as fsConstants, type Stats } from 'node:fs'
import { LocationFileError, fileRefName, type SiteFileRef } from '@agenthix/core'
import type { FileHandle } from '../../agents/runtime/containedFile'
import { openInLocation, openInOwnerFolder } from '../storage/locationContainment'
import { openKnowledgeForRead } from '../knowledge/knowledgeRead'

export type SiteFileRefusal = 'not-found' | 'not-a-file'

export type OpenedSiteFile =
  | { ok: true; handle: FileHandle; stat: Stats; name: string }
  | { ok: false; refusal: SiteFileRefusal }

/** Containment refusals and a missing file read the same from outside: which one would say what is on this disk. */
const NOT_FOUND_CODES = new Set(['outside', 'not_found', 'not_a_directory', 'invalid'])

async function openRef(ref: SiteFileRef, method: string): Promise<FileHandle> {
  switch (ref.space) {
    case 'place':
      return (await openInLocation(ref.loc, method, ref.path, fsConstants.O_RDONLY)).handle
    case 'artefact':
      return (await openInOwnerFolder(ref.owner, 'artefacts', method, ref.name, fsConstants.O_RDONLY)).handle
    case 'knowledge':
      return openKnowledgeForRead(method, ref.owner, ref.path, ref.versionId)
  }
}

/**
 * The file, open, with its descriptor's stat; or the refusal a person may be told. Any other failure is thrown as a
 * `LocationFileError` naming no path on this disk. The caller closes the handle.
 */
export async function openSiteFile(ref: SiteFileRef, method: string): Promise<OpenedSiteFile> {
  let handle: FileHandle
  try {
    handle = await openRef(ref, method)
  } catch (err) {
    if (err instanceof LocationFileError) {
      if (err.code === 'not_a_file') return { ok: false, refusal: 'not-a-file' }
      if (NOT_FOUND_CODES.has(err.code)) return { ok: false, refusal: 'not-found' }
      throw err
    }
    // Only an owner id this site would never store gets here (`assertSafeId`), and its message echoes the id raw.
    return { ok: false, refusal: 'not-found' }
  }
  let stat: Stats
  try {
    stat = await handle.stat()
  } catch (err) {
    await handle.close().catch(() => {})
    throw new LocationFileError('failed', `${method} could not read "${fileRefName(ref)}" (${(err as NodeJS.ErrnoException | null)?.code ?? 'unknown'})`)
  }
  const refusal: SiteFileRefusal | null = !stat.isFile() ? 'not-a-file' : stat.nlink > 1 ? 'not-found' : null
  if (refusal) {
    await handle.close().catch(() => {})
    return { ok: false, refusal }
  }
  return { ok: true, handle, stat, name: fileRefName(ref) }
}
