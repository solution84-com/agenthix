/**
 * `file.about` (site protocol 1.8), on the control channel: what hq asks before it opens a file, so it can choose the
 * kind and sign a ticket at the file's version. Only facts cross: the size, the modified time and the version from the
 * open descriptor, a content-type guess from the name, and whether the first `TEXT_SNIFF_BYTES` look like text. Never
 * a path on this disk, and no content.
 *
 * The file is opened exactly as `files.serve` opens it (`openSiteFile`), so a file this answers for is one a ticket
 * at this version can be served for, and one it refuses would be refused there too.
 */
import {
  FILE_ABOUT_METHOD,
  LocationFileError,
  TEXT_SNIFF_BYTES,
  contentTypeForName,
  looksLikeText,
  readFileRef,
  type FileAboutResult,
  type SiteFileRef,
} from '@agenthix/core'
import type { FileHandle } from '../../agents/runtime/containedFile'
import { aboutGitFile, isAtCommit } from './gitFiles'
import { openSiteFile } from './openSiteFile'

/**
 * The file the params name, or the answer when they name one only by a path that steps out of its folder (`..`, a
 * name with a slash): that is a file which is not there, as a link leading out is. Anything else malformed is
 * `invalid`.
 */
function readParams(params: unknown): SiteFileRef | 'steps-out' {
  const ref = readFileRef(params)
  if (ref && ref.space !== 'upload') return ref
  if (!ref && typeof params === 'object' && params !== null) {
    const rest = readFileRef({ ...params, path: 'x', name: 'x' })
    if (rest && rest.space !== 'upload') return 'steps-out'
  }
  throw new LocationFileError('invalid', `${FILE_ABOUT_METHOD} needs a file in a place, an artefact or a knowledge page`)
}

async function firstBytes(handle: FileHandle, size: number): Promise<Uint8Array> {
  const buf = Buffer.alloc(Math.min(size, TEXT_SNIFF_BYTES))
  let filled = 0
  while (filled < buf.length) {
    const { bytesRead } = await handle.read(buf, filled, buf.length - filled, filled)
    if (bytesRead === 0) break
    filled += bytesRead
  }
  return buf.subarray(0, filled)
}

export async function fileAbout(params: unknown): Promise<FileAboutResult> {
  const ref = readParams(params)
  if (ref === 'steps-out') return { ok: false, refusal: 'not-found' }
  // A commit's file is described by the helper, with its first bytes: nothing is copied out just to be described.
  if (isAtCommit(ref)) return aboutGitFile(ref, FILE_ABOUT_METHOD)
  const opened = await openSiteFile(ref, FILE_ABOUT_METHOD)
  if (!opened.ok) return opened
  const { handle, stat, name, version, modifiedAt } = opened
  try {
    return {
      ok: true,
      name,
      size: stat.size,
      modifiedAt: modifiedAt.toISOString(),
      version,
      contentType: contentTypeForName(name),
      looksLikeText: looksLikeText(await firstBytes(handle, stat.size)),
    }
  } catch (err) {
    throw new LocationFileError('failed', `${FILE_ABOUT_METHOD} could not read "${name}" (${(err as NodeJS.ErrnoException | null)?.code ?? 'unknown'})`)
  } finally {
    await handle.close().catch(() => {})
  }
}
