/**
 * The renderer contract's core half (adr-0155): what every renderer is given, and what it reports. A renderer can
 * only draw: it is given the file's facts and a way to read its bytes through the relay, and reports one state, which
 * the frame turns into words. The registry and the `Renderer` entry itself are `ui`'s.
 */
import type { FileKind } from './kind.js'

export interface FileFacts {
  name: string
  size: number
  /** `fileVersion` of the file when it was opened. */
  version: string
  contentType: string
  kind: FileKind
  /** For `code` only. */
  language?: string
}

export interface FileBytes {
  /** The ticket link on the relay. */
  link: string
  /** The first bytes, at most `limit`; `whole` when that was the whole file. */
  read(limit: number): Promise<{ bytes: Uint8Array; whole: boolean }>
  /** Inclusive offsets, as a `Range` header has them. */
  range(start: number, end: number): Promise<Uint8Array>
}

export type RendererMode = 'opened' | 'embedded'
export type RendererRuns = 'page' | 'frame'

export type RendererFailure = 'unreadable' | 'too-large' | 'changed' | 'unavailable'

export type RendererReport =
  | { state: 'ready' }
  | { state: 'partial'; shown: number }
  | { state: 'failed'; reason: RendererFailure }

/**
 * A file's version: its size and modified time, as a ticket and `FileFacts` carry it. hq makes it from a stat's ISO
 * time and the site from an open descriptor's time, so both are taken to whole milliseconds and agree.
 */
export function fileVersion(size: number, modifiedAt: string | number | Date): string {
  const ms = modifiedAt instanceof Date ? modifiedAt.getTime() : typeof modifiedAt === 'string' ? Date.parse(modifiedAt) : modifiedAt
  if (!Number.isSafeInteger(size) || size < 0 || !Number.isFinite(ms)) throw new Error('A file version needs a size and a time')
  return `${size}:${Math.floor(ms)}`
}
