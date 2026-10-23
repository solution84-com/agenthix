/**
 * Running and reaching a workspace's dev server — a preview (ADR-0063 decides
 * both of this group's premises: that a preview is a process inside the
 * boundary's own container, and that an active one holds that container
 * against idle teardown. ADR-0051: a closed set of named methods, never a
 * generic relay). The contract between
 * hq's caller and the site's handlers
 * (`site/src/server/hq/previewMethods.ts`), which exec into the container the
 * boundary already has.
 *
 * ## A preview is a process, not a container
 *
 * A container belongs to one storage boundary for its whole life, and its
 * identity includes a signature of everything it mounts — so a container
 * whose mount set differs is a DIFFERENT container. Anything that varies a
 * mount per preview therefore makes two pieces of work in the same boundary
 * evict each other.
 *
 * That is why `preview.start` names a location and a command and nothing that
 * could become a mount. The site runs the command inside the container that
 * boundary is already using, so the dev server serves exactly the bytes the
 * run sees, and no preview can put a per-preview component into a mount
 * signature. A boundary with no running container is REFUSED (`no_container`)
 * rather than given one: a container built from a preview's parameters is not
 * a container built from a run's verified capability, and the two must never
 * be confused.
 *
 * ## The bytes do not cross this channel
 *
 * `start` and `stop` are control methods — a command, a port, an id. The
 * preview's own traffic crosses the content transport under
 * `preview.connect`, which is a byte stream and belongs there for the same
 * reason a file's bytes do.
 *
 * ## Who checks what
 *
 * hq settles who may watch a preview before it asks for one, exactly as it
 * settles entitlement before any other location call. Neither params shape
 * carries a user id, and the site's registry holds no authority and answers
 * no question about people — per ADR-0042 it has no identity store to answer
 * one from.
 *
 * ## What a refusal may say
 *
 * A code, prose naming the method and the location by hq's own ids, and — for
 * `not_ready` only — the tail of the command's own output. NEVER a path on
 * the site's disk. The command's output is the exception because a dev server
 * that will not start is unusable without it, and a silent "did not become
 * ready" is what made this feature hard to use before.
 */
import type { LocationRef } from '../storage/locationRef.js'

export const PREVIEW_METHODS = {
  /** Control channel: start a dev server inside a boundary's existing container. */
  start: 'preview.start',
  /** Control channel: stop one, by the id `start` returned. */
  stop: 'preview.stop',
  /** Content transport: a byte stream to a running preview. */
  connect: 'preview.connect',
} as const

export type PreviewMethod = (typeof PREVIEW_METHODS)[keyof typeof PREVIEW_METHODS]

export interface PreviewStartParams {
  /** The boundary whose container holds the files. A preview never creates one. */
  location: LocationRef
  /** The owner's slug — hq holds the names; the site builds container paths from them. */
  ownerSlug: string
  /** The session the preview belongs to, so it can expire with it. */
  sessionId: string
  command: string
  port: number
  /**
   * For a task in a person's personal project: that person, whose container the task ran in, so the preview runs
   * there too. Absent for everything else, and from an hq before site protocol 1.3. hq sets it only from the project's
   * own owner, as it signs a capability's `personalProject` claim.
   */
  personalOwnerId?: string
}

/**
 * The id is minted by the SITE, because the site is what it identifies: a
 * process inside one of its containers. hq stores it and hands it back to
 * `stop` and `connect`.
 */
export interface PreviewStartResult {
  previewId: string
}

export interface PreviewStopParams {
  previewId: string
}

/**
 * `stopped: false` for an id the site does not know, rather than a refusal.
 * hq calls `stop` on a sweep, and a preview that is already gone — its
 * container swept, the site restarted — is the expected case, not an error.
 */
export interface PreviewStopResult {
  stopped: boolean
}

export interface PreviewConnectParams {
  previewId: string
}

/**
 * Why a refusal needs a vocabulary of its own.
 *
 * A channel failure carries exactly one string, so any distinction hq needs
 * has nowhere to live but inside it. hq needs one in particular:
 * `no_container` is not a fault and must not be reported as one — it means
 * "nothing is running in this storage yet", which the person fixes by
 * starting a run, and which no other code here would let hq tell them.
 */
export const PREVIEW_ERROR_CODES = [
  /** The call's parameters are not a shape this method accepts. hq's bug, or a version skew. */
  'invalid',
  /**
   * The boundary has no running container, so there is nothing to run the dev
   * server inside. Not a fault: a preview is a process in the container a run
   * is already using, and this boundary has no run up.
   */
  'no_container',
  /**
   * The command started and the port never opened. The detail carries the
   * tail of the command's own output, which is the whole difference between a
   * preview somebody can fix and one they cannot.
   */
  'not_ready',
  /** The site knows no preview by that id. */
  'not_found',
  /** docker refused the exec itself. The reason is in the site's own log. */
  'exec_failed',
] as const

export type PreviewErrorCode = (typeof PREVIEW_ERROR_CODES)[number]

/** What says "this string was encoded by us", so a decoder cannot hand a
 *  caller a code from a vocabulary it is not checking against. */
export const PREVIEW_ERROR_MARKER = 'preview/'

/** `<marker><code>: <detail>`. Only the FIRST colon separates, so a detail may hold one. */
const ENCODED_ERROR = /^([a-z_]+): ([\s\S]*)$/

export function encodePreviewError(code: PreviewErrorCode, detail: string): string {
  return `${PREVIEW_ERROR_MARKER}${code}: ${detail}`
}

/**
 * Null for anything that is not one of ours. Never a partial guess: the
 * marker must be there AND the prefix behind it must be a published code.
 */
export function decodePreviewError(wire: string): { code: PreviewErrorCode; message: string } | null {
  if (typeof wire !== 'string' || !wire.startsWith(PREVIEW_ERROR_MARKER)) return null
  const match = ENCODED_ERROR.exec(wire.slice(PREVIEW_ERROR_MARKER.length))
  if (!match) return null
  const code = match[1] as PreviewErrorCode
  if (!(PREVIEW_ERROR_CODES as readonly string[]).includes(code)) return null
  return { code, message: match[2] }
}

/**
 * One class for both apps rather than one each. The site raises it, hq
 * rebuilds it from the wire, and neither can drift from the other's idea of
 * what the codes mean.
 */
export class PreviewError extends Error {
  constructor(readonly code: PreviewErrorCode, readonly detail: string) {
    super(encodePreviewError(code, detail))
    this.name = 'PreviewError'
  }

  /** Rebuild from the single string a channel failure carries. */
  static fromWire(wire: string): PreviewError | null {
    const decoded = decodePreviewError(wire)
    return decoded ? new PreviewError(decoded.code, decoded.message) : null
  }
}
