/**
 * `expand` (long conversations spec, Zooming in): the full summaries of one, several or all segments, in span
 * order. The result is appended as a tool result behind the cached prefix; what does not fit the room left in the
 * window is named, never cut short.
 */
import { spanOf, tokensOf, type SegmentRecord } from './spans'

export type ExpandResult = {
  expanded: Array<ReturnType<typeof spanOf> & { segment: string; brief: string; summary: string }>
  /** Asked for and left out because the room ran out: oldest first, so the lead can ask for them next. */
  notIncluded: Array<ReturnType<typeof spanOf> & { segment: string; brief: string }>
  unknown: string[]
  note?: string
}

export function expandSegments(all: readonly SegmentRecord[], which: 'all' | readonly string[], roomTokens: number): ExpandResult {
  const byId = new Map(all.map(s => [s.id, s]))
  const unknown = which === 'all' ? [] : [...new Set(which)].filter(id => !byId.has(id))
  const wanted = which === 'all' ? new Set(all.map(s => s.id)) : new Set(which)
  const asked = all.filter(s => wanted.has(s.id)).sort((a, b) => a.firstSeq - b.firstSeq)

  const expanded: ExpandResult['expanded'] = []
  const notIncluded: ExpandResult['notIncluded'] = []
  let left = Math.max(0, roomTokens)
  let full = false
  for (const s of asked) {
    const cost = tokensOf(s.summary)
    // Oldest first, and once one does not fit nothing after it is taken: the lead asks for the rest by id.
    if (!full && cost <= left) {
      left -= cost
      expanded.push({ segment: s.id, ...spanOf(s), brief: s.brief, summary: s.summary })
    } else {
      full = true
      notIncluded.push({ segment: s.id, ...spanOf(s), brief: s.brief })
    }
  }
  const notes: string[] = []
  if (notIncluded.length) notes.push(`There was no room for ${notIncluded.length} more; they are named in notIncluded. Ask for them by id once there is room, or read their messages.`)
  if (unknown.length) notes.push(`No such segment: ${unknown.join(', ')}.`)
  return { expanded, notIncluded, unknown, ...(notes.length && { note: notes.join(' ') }) }
}
