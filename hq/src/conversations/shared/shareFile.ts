/**
 * Keeping a photo or file a person adds to a conversation (conversation's design, *Photos and files*): written into the
 * conversation's own place, under `Shared in conversations/`, before the message that carries it is sent, so the
 * agent and the work it hands off can open it.
 *
 * Only someone who may speak in the conversation and work in its place may add one. What it is, is read from its
 * bytes (`sniffSharedContent`), never taken from its name or the type the browser sent, and its name is cleaned to
 * one plain segment ending in the extension its content gives it. The site writes it as a new file, never over
 * another, and only into that folder.
 */
import { HttpError } from 'wasp/server'
import {
  LocationFileError, SHARED_FILE_MAX_BYTES, SHARED_KINDS_WORDS, cleanSharedName, sniffSharedContent,
  type LocationRef, type SharedFile, type ShareConversationFileArgs,
} from '@agenthix/core'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import { SiteTooOldToShare } from './onSite'

const NOTHING = 'Nothing was changed.'
const MAX_MB = SHARED_FILE_MAX_BYTES / (1024 * 1024)
/** Base64 is four characters for three bytes; a little over that, for the data URL's head. */
const MAX_DATA_URL_CHARS = Math.ceil(SHARED_FILE_MAX_BYTES / 3) * 4 + 200

export interface ShareFileDeps {
  /** The conversation's own place, as a location, once the person is known to speak in it; throws an HttpError otherwise. */
  placeFor(conversationId: unknown, userId: string): Promise<LocationRef>
  /** Throws an HttpError when the person may not write in the place. */
  mayWork(loc: LocationRef, userId: string): Promise<void>
  /** Writes the file into the place's shared folder; the name it was written under. */
  write(loc: LocationRef, name: string, bytes: Buffer): Promise<string>
}

function bytesOf(dataUrl: unknown): Buffer {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new HttpError(400, `A photo or file can be up to ${MAX_MB} MB. ${NOTHING}`)
  }
  const match = /^data:[^,;]*(?:;[^,;]*)*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl)
  if (!match) throw new HttpError(400, `HQ couldn't read the file that was sent. Add it again. ${NOTHING}`)
  const bytes = Buffer.from(match[1], 'base64')
  if (bytes.length > SHARED_FILE_MAX_BYTES) throw new HttpError(400, `A photo or file can be up to ${MAX_MB} MB. ${NOTHING}`)
  if (bytes.length === 0) throw new HttpError(400, `That file is empty. ${NOTHING}`)
  return bytes
}

/** A refusal from the site, or its absence, in words a person can act on. */
function failed(err: unknown, shown: string): HttpError {
  if (err instanceof HttpError) return err
  if (err instanceof SiteUnreachableError) return new HttpError(503, `${err.message} ${shown} wasn't added. ${NOTHING}`)
  if (err instanceof SiteTooOldToShare) {
    return new HttpError(409, `The place's Execution Site is too old to keep a shared file: an organisation admin can update it. ${NOTHING}`)
  }
  if (err instanceof LocationFileError) {
    const why = err.code === 'refused' || err.code === 'not_a_directory' || err.code === 'outside'
      ? "Something in the place's files stands where Shared in conversations should be, so HQ left it alone. Look at the place's files."
      : "The place's Execution Site couldn't keep it."
    return new HttpError(409, `${why} ${shown} wasn't added. ${NOTHING}`)
  }
  return new HttpError(500, `HQ couldn't keep ${shown}. Try again. ${NOTHING}`)
}

export async function shareConversationFileWith(args: ShareConversationFileArgs, userId: string, deps: ShareFileDeps): Promise<SharedFile> {
  const loc = await deps.placeFor(args?.conversationId, userId)
  await deps.mayWork(loc, userId)
  const raw = typeof args?.name === 'string' ? args.name : ''
  const shown = raw ? `"${raw.slice(0, 80)}"` : 'The file'
  const bytes = bytesOf(args?.dataUrl)
  const content = sniffSharedContent(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length), raw)
  if (!content) throw new HttpError(400, `HQ keeps ${SHARED_KINDS_WORDS.replace(/^Photos/, 'photos')}. ${shown} is none of these, so it wasn't added. ${NOTHING}`)
  const name = cleanSharedName(raw, content)
  try {
    const written = await deps.write(loc, name, bytes)
    return { name: written, kind: content.kind, mime: content.mime, size: bytes.length }
  } catch (err) {
    throw failed(err, shown)
  }
}
