/**
 * `location.readFile` — one file out of one of this site's storage locations,
 * streamed to hq.
 *
 * ## Why the bytes are here and not on the control channel
 *
 * All file bytes cross the content transport, whatever the file's size. A size
 * threshold would mean two implementations of one read, two sets of failure
 * modes, and a boundary that is wrong for some file the day it is chosen. This
 * transport already has framing, a 16 MiB unread-buffer cap, write
 * backpressure and a 64 KiB chunk bound; the control channel has a
 * fifteen-second JSON round trip and was never meant to carry a file.
 *
 * ## The three ways a content handler goes wrong
 *
 * This is the second handler written against this transport, and each hazard
 * is answered explicitly rather than by luck:
 *
 *  - **Resolving without ending the writable half** leaves the stream open
 *    until the connection drops. hq waits on an `end` frame that never comes
 *    and reads a finished read as a hung site. So the pipe below is set up
 *    with `end: false` and the half is ended by hand, with this function
 *    resolving only once that `end` has actually gone out.
 *  - **Reading the request with `for await`** destroys the stream before it
 *    can reply. This handler reads nothing at all: hq opens the stream,
 *    sends no body, and the site writes straight back.
 *  - **Losing the stream before the pipe exists.** Containment and the stat
 *    are both `await`s, so a cancel — or a dropped socket — can land after the
 *    handler starts and before anything is listening for it. Left alone, the
 *    descriptor stays open and the promise never settles: nothing fails,
 *    nothing logs, and the only symptom is a process that eventually runs out
 *    of descriptors. So the stream is checked before the read stream exists,
 *    the descriptor is closed on every exit before then, its `close` is
 *    listened for from the moment the stream does exist, and every exit from
 *    that window destroys the read and settles.
 *
 * ## Containment, and what a refusal may say
 *
 * Opened through `openInLocation` — the same containment the control methods
 * use, symlinks resolved on both sides, so a link planted inside a location
 * cannot walk out. The file is opened ONCE and the descriptor confirmed to be
 * the entry the check approved; the bytes are streamed from that descriptor, so
 * a link swapped in after the check cannot redirect the read. A refused path
 * sends no bytes at all.
 *
 * Every failure leaves here as a `LocationFileError`: a code hq can act on and
 * prose naming the method, the RELATIVE path and the location. A raw `fs`
 * error would carry the absolute path it failed on, and `contentConnection.ts`
 * forwards a handler's message to hq verbatim — which would hand hq this
 * site's storage layout through the error path.
 *
 * hq checks entitlement before it asks. This handler's params carry a location
 * and a relative path and no user id — a site holds no identity store and has
 * nothing to re-derive entitlement from (ADR-0042).
 */
import { constants as fsConstants } from 'node:fs'
import {
  LOCATION_FILE_METHODS,
  MAX_CHUNK_BYTES,
  LocationFileError,
  type LocationFileErrorCode,
} from '@agenthix/core'
import type { ContentHandler } from './contentMethods'
// Separate modules, deliberately: the wire schemas these reads validate against
// belong to the channel methods, and containment belongs to the module that
// owns it. Importing the second through the first would have made this file
// look like it depended on the control methods, which it does not.
import { readFileParams } from '../../storage/locationFileMethods'
import { readKnowledgeParams } from '../../storage/ownerFolderMethods'
import {
  describeOwnerFolder,
  locationFileCodeFor,
  locationFileError,
  locationFileErrorFor,
  parseParams,
  openInLocation,
  openInOwnerFolder,
  refuse,
} from '../../storage/locationContainment'
import type { FileHandle } from '../../../agents/runtime/containedFile'
import { openKnowledgeForRead } from '../../knowledge/knowledgeRead'
import { describeKnowledgeOwner, nameForRefusal } from '../../knowledge/owner'

const METHOD = LOCATION_FILE_METHODS.readFile

export const handleLocationRead: ContentHandler = async (stream, params) => {
  const { loc, relPath } = parseParams(readFileParams, params, METHOD)
  const { handle } = await openInLocation(loc, METHOD, relPath, fsConstants.O_RDONLY)
  await streamContainedFile(stream, handle, {
    cancelled: () => locationFileError('cancelled', METHOD, loc, relPath),
    notAFile: () => locationFileError('not_a_file', METHOD, loc, relPath),
    failure: err => locationFileErrorFor(err, METHOD, loc, relPath),
    refuseStat: err => refuse(err, METHOD, loc, relPath),
  })
}

/**
 * One file out of an owner's `artefacts/`, or one knowledge page or kept
 * version, streamed to hq.
 *
 * The same stream and the same rules, a different address: neither is a
 * location (core's `LOCATION_FILE_METHODS.listArtefacts` says why), and their
 * containment refuses every link (`openInOwnerFolder`; for knowledge,
 * `openKnowledgeForRead` on the knowledge root outside the owner's folder).
 * `maxBytes` is checked against the descriptor's own size before a byte is
 * sent, so hq can decline a file too large to show without the site streaming it.
 */
function ownerFolderRead(
  parse: (params: unknown) => { open: () => Promise<FileHandle>; detail: string; maxBytes: number },
): ContentHandler {
  return async (stream, params) => {
    const { open, detail, maxBytes } = parse(params)
    const handle = await open()
    const named = (code: LocationFileErrorCode) => new LocationFileError(code, detail)
    const classify = (err: unknown) => (err instanceof LocationFileError ? err : named(locationFileCodeFor(err)))
    await streamContainedFile(stream, handle, {
      cancelled: () => named('cancelled'),
      notAFile: () => named('not_a_file'),
      failure: classify,
      refuseStat: err => {
        throw classify(err)
      },
      maxBytes,
      tooLarge: () => named('too_large'),
    })
  }
}

const KNOWLEDGE_METHOD = LOCATION_FILE_METHODS.readKnowledge

/** `location.readKnowledge` — one page by its path in the owner's pages, or with `versionId` one kept version of it. */
export const handleKnowledgeRead = ownerFolderRead(params => {
  const { ownerType, ownerId, relPath, maxBytes, versionId } = parseParams(readKnowledgeParams, params, KNOWLEDGE_METHOD)
  const owner = { ownerType, ownerId }
  return {
    open: () => openKnowledgeForRead(KNOWLEDGE_METHOD, owner, relPath, versionId),
    detail: `${KNOWLEDGE_METHOD} "${nameForRefusal(relPath)}" in ${describeKnowledgeOwner(owner)}`,
    maxBytes,
  }
})

/**
 * Everything after the path is resolved: the stat, the descriptor, the pipe
 * and the three hazards above. Shared by both reads so neither can answer one
 * of them differently; what each read supplies is how to name a failure, since
 * a refusal may name only what hq already knows.
 */
interface ReadFailures {
  cancelled: () => LocationFileError
  notAFile: () => LocationFileError
  failure: (err: unknown) => LocationFileError
  refuseStat: (err: unknown) => never
  /** The most bytes the caller will take, and how to refuse a larger file. */
  maxBytes?: number
  tooLarge?: () => LocationFileError
}

async function streamContainedFile(
  stream: Parameters<ContentHandler>[0],
  handle: FileHandle,
  fail: ReadFailures,
): Promise<void> {
  const cancelled = fail.cancelled

  // The descriptor is ours until the read stream takes it over below; every
  // exit before that point closes it here.
  try {
    // Before a byte is read: a directory streamed as a file would arrive at hq
    // as an EISDIR mid-transfer, after the stream had already been accepted.
    let stat
    try {
      stat = await handle.stat()
    } catch (err) {
      fail.refuseStat(err)
    }
    if (!stat.isFile()) throw fail.notAFile()
    if (fail.maxBytes !== undefined && stat.size > fail.maxBytes) throw (fail.tooLarge ?? fail.notAFile)()

    // hq may already have gone away while the awaits above were in flight, and
    // a `close` that fired then will never reach a listener attached after it.
    if (stream.destroyed || stream.writableEnded) throw cancelled()
  } catch (err) {
    await handle.close().catch(() => {})
    throw err
  }

  // One read chunk per frame: the transport splits anything larger anyway, and
  // matching the bound keeps the copy count down. The stream closes the
  // descriptor when it ends or is destroyed.
  const source = handle.createReadStream({ highWaterMark: MAX_CHUNK_BYTES })

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let ending = false

    const done = (err?: Error) => {
      if (settled) return
      settled = true
      source.off('error', onSourceError)
      stream.off('error', onStreamError)
      stream.off('close', onStreamClose)
      if (!err) {
        resolve()
        return
      }
      // `destroy` is what closes the descriptor; without it a failed or
      // cancelled read holds one for the life of the process.
      source.unpipe(stream)
      source.destroy()
      reject(err)
    }

    const onSourceError = (err: unknown) => done(fail.failure(err))
    const onStreamError = (err: unknown) => done(fail.failure(err))
    // A close DURING our own end is the natural end of a finished read, not a
    // cancel: this transport's sends can complete synchronously, so hq's reply
    // to our `end` frame can close this stream before `end`'s own callback runs.
    const onStreamClose = () => done(ending ? undefined : cancelled())

    source.on('error', onSourceError)
    stream.on('error', onStreamError)
    stream.on('close', onStreamClose)

    // `end: false`, then an explicit `end` below — see this file's header.
    // `pipe` is what gives the read write-backpressure across the mux.
    source.pipe(stream, { end: false })
    source.on('end', () => {
      ending = true
      stream.end(() => done())
    })

    // The listeners are attached now; if the stream went away between the
    // check above and this line, nothing would ever have told us.
    if (stream.destroyed) done(cancelled())
  })
}
