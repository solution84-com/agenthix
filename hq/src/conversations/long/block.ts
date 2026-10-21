/**
 * The compaction block (long conversations spec, The record keeps everything): the second part of the lead's
 * context, after the instructions. The ledger head as it stood at the latest compaction, the brief of every older
 * segment, and the full summary of the latest. Built only from stored segments, so it is the same text on every
 * call until the next compaction writes a new segment.
 */
import { ledgerHeadText, type KeptEntry } from './ledgerHead'

export interface OpenedSegment {
  id: string
  firstSeq: number
  lastSeq: number
  firstAt: string
  lastAt: string
  brief: string
  summary: string
  /** The ledger head as it stood when the segment was written. */
  ledgerHead: KeptEntry[]
}

const minute = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`

/** A segment's id and span, as the lead names it to expand it. */
export function spanLine(s: Pick<OpenedSegment, 'id' | 'firstSeq' | 'lastSeq' | 'firstAt' | 'lastAt'>): string {
  return `${s.id} (messages ${s.firstSeq}–${s.lastSeq}, ${minute(s.firstAt)} to ${minute(s.lastAt)} UTC)`
}

/** The block for segments oldest first; null before the first compaction. */
export function compactionBlock(segments: readonly OpenedSegment[]): string | null {
  const latest = segments[segments.length - 1]
  if (!latest) return null
  const parts = [
    '# Earlier in this conversation',
    'The older part of this conversation was folded into segments; what follows stands in for it. The messages after it are verbatim.',
  ]
  const head = ledgerHeadText(latest.ledgerHead)
  if (head) parts.push(`## Kept since the conversation began\n${head}`)
  const older = segments.slice(0, -1)
  if (older.length > 0) parts.push(`## Earlier segments, in brief\n${older.map(s => `- ${spanLine(s)}: ${s.brief}`).join('\n')}`)
  parts.push(`## The latest segment, in full\n${spanLine(latest)}: ${latest.brief}\n\n${latest.summary}`)
  return parts.join('\n\n')
}
