/**
 * A shared file written to and read back from the site that holds the conversation's place (site protocol 1.14,
 * `location.shareFile`): the file's bytes cross the content transport, as every file's do, and the site answers the
 * name it wrote them under. Nothing here checks who is asking: the caller has (`shareFile.ts`, `turnImages`).
 */
import {
  LOCATION_FILE_METHODS, SHARED_FOLDER,
  type LocationRef, type LocationShareFileParams, type LocationShareFileResult, type ProtocolVersion,
} from '@agenthix/core'
import { siteChannelRegistry } from '../../sites/channel'
import { openContentStream, ContentStreamFailed, type ContentStream } from '../../sites/content'
import { readFileOnSite, translateFailure } from '../../storage/locationFileStore'
import { resolveStorageSite } from '../../storage/storageSite'

export const SHARE_TIMEOUT_MS = 60_000
const FIRST_WITH_SHARE = { major: 1, minor: 14 }

export function speaksShareFile(v: ProtocolVersion): boolean {
  return v.major > FIRST_WITH_SHARE.major || (v.major === FIRST_WITH_SHARE.major && v.minor >= FIRST_WITH_SHARE.minor)
}

/** The site that holds the place is too old to keep a shared file. */
export class SiteTooOldToShare extends Error {}

const placeOf = (loc: LocationRef): LocationRef => ({ ...loc, workspaceId: null, taskId: null })

function sendAndRead(stream: ContentStream, body: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (stream.errored) return reject(stream.errored)
    const chunks: Buffer[] = []
    let settled = false
    const settle = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn() } }
    const timer = setTimeout(() => {
      stream.destroy()
      settle(() => reject(new ContentStreamFailed(`No answer within ${SHARE_TIMEOUT_MS} ms`, 'timeout')))
    }, SHARE_TIMEOUT_MS)
    timer.unref?.()
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('error', err => settle(() => reject(err)))
    stream.on('end', () => settle(() => resolve(Buffer.concat(chunks))))
    stream.on('close', () => settle(() => reject(stream.errored ?? new ContentStreamFailed('The stream closed before the site answered', 'disconnected'))))
    stream.end(body)
  })
}

/** Writes the file into the place's shared folder and answers the name the site gave it there. */
export async function shareFileOnSite(loc: LocationRef, name: string, bytes: Buffer): Promise<string> {
  const siteId = await resolveStorageSite(loc)
  const conn = siteChannelRegistry.get(siteId)
  if (conn && !speaksShareFile(conn.protocol)) throw new SiteTooOldToShare()
  const method = LOCATION_FILE_METHODS.shareFile
  const params: LocationShareFileParams = { loc: placeOf(loc), name, size: bytes.length }
  let answer: Buffer
  try {
    answer = await sendAndRead(await openContentStream(siteId, method, params), bytes)
  } catch (err) {
    return translateFailure(siteId, method, err)
  }
  const result = JSON.parse(answer.toString('utf-8')) as Partial<LocationShareFileResult>
  if (typeof result.name !== 'string') throw new Error(`${method}: the site answered without a name`)
  return result.name
}

/** One shared file's bytes, read back from the place's shared folder. */
export function readSharedOnSite(loc: LocationRef, name: string): Promise<Buffer> {
  return readFileOnSite(placeOf(loc), `${SHARED_FOLDER}/${name}`)
}
