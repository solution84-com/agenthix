/**
 * What the site answers when it refuses a live preview: each says what is wrong, who holds it, what to do, and ends
 * "Nothing was changed." when nothing was.
 */
import type { LivePreviewAnswer, LivePreviewRefusal, LivePreviewRefusalCode } from '@agenthix/core'

export type Refused = { ok: false; refusal: LivePreviewRefusal }

export function refuse(code: LivePreviewRefusalCode, message: string, livePreviewIds?: string[]): Refused {
  return { ok: false, refusal: { code, message, ...(livePreviewIds ? { livePreviewIds } : {}) } }
}

export const isRefused = <T>(v: T | Refused): v is Refused =>
  typeof v === 'object' && v !== null && (v as { ok?: unknown }).ok === false && 'refusal' in (v as object)

export type Answer<T> = LivePreviewAnswer<T>

export const MALFORMED = refuse('malformed', 'This site could not read what HQ asked of the live preview. Nothing was changed.')
export const UNKNOWN = refuse('unknownPreview', 'This site has no such live preview. Nothing was changed.')
export const STOPPED = refuse('stopped', 'This live preview has stopped. Start it again from the workspace view. Nothing was changed.')
export const PAUSED_GUARD = refuse('paused',
  'This live preview is paused: the guard found something unexpected. A person resumes it in HQ after reading what it found. Nothing was changed.')
export const PAUSED_LINE = refuse('paused',
  'This live preview is paused while this site has no line to HQ. It resumes by itself once the line is back. Nothing was changed.')
export const TURNED_OFF = refuse('turnedOff',
  'Live previews are off on this site. A fleet admin can turn them on in the Fleet Console. Nothing was changed.')
export const NO_CONTAINERS = refuse('guardDown',
  'This site runs agents without containers of their own, so it has no guard and runs no live preview. Nothing was changed.')
export const GUARD_DOWN = refuse('guardDown',
  'The live-preview guard is not running on this site, so no live preview starts. Try again in a minute; if it stays, the site\'s administrator can look at its log. Nothing was changed.')

export function atLimit(limit: number, ids: string[]): Refused {
  return refuse('atLimit',
    `This site runs ${limit} live preview${limit === 1 ? '' : 's'} at once. Stop one first, or pick another site. Nothing was changed.`, ids)
}

export function branchOpen(ids: string[]): Refused {
  return refuse('branchOpen', 'This branch already has a live preview on this site. Open that one. Nothing was changed.', ids)
}

export function protectionsDown(problem: string): Refused {
  return refuse('protectionsDown',
    `The network protections that keep a live preview off private addresses are not in place on this site: ${problem} Nothing was changed.`)
}

export const pausedRefusal = (reason: 'lineLost' | 'guard'): Refused => (reason === 'guard' ? PAUSED_GUARD : PAUSED_LINE)
