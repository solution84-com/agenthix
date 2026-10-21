/**
 * What voice says of a reply, a sentence at a time (conversational experience spec, Voice): the reply's text as
 * `spokenText` reads it — prose as written, each shown part's spoken line in place of its body — cut into
 * sentences, markup stripped, each with where its words sit in the written reply so the screen reveals that text
 * in step with the voice. What cannot be read aloud (a code block, a table, a rule) is skipped.
 *
 * Works on a reply still streaming: only what is complete is returned, and what is returned for a prefix of the
 * text is returned unchanged for the whole of it, so a caller can speak units as they appear.
 */

import { ENCOURAGEMENT_LINE } from '../../shared/conversations/shownParts'

export interface SpeechUnit {
  /** The words as spoken: markup stripped, or a shown part's spoken line. */
  text: string
  /** Where in the written reply these words are. */
  start: number
  end: number
  /** For a shown part: the end of its block once it is closed, so what was heard keeps the whole part. */
  blockEnd?: number
}

const SHOWN_OPEN = /^:::shown[ \t]*(.*)$/
const SHOWN_CLOSE = /^:::[ \t]*$/
const FENCE = /^\s*(```|~~~)/
const TABLE = /^\s*\|/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
/** A line's own marker, which is not part of what is said: a heading, a quote, a list item, a task box. */
const LINE_MARKER = /^\s*(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d{1,3}[.)]\s+)/
/** A sentence ends at its punctuation (and any closing quote or bracket), followed by space. */
const SENTENCE_END = /[.!?]+["'”’)\]]*(?=\s)/g
/** A line not yet complete that may turn out not to be prose: wait for its end. */
const UNSURE_START = /^\s*([|`~:>]|#|\d{1,3}[.)]?$|[-*+]$)/

export function stripMarkup(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`+/g, '')
    .replace(/\*{1,3}|~~/g, '')
    .replace(/(^|[\s(])_{1,2}(?=\S)|(?<=\S)_{1,2}(?=$|[\s).,!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function unit(raw: string, start: number, end: number): SpeechUnit | null {
  const text = stripMarkup(raw)
  return /\w/.test(text) ? { text, start, end } : null
}

/** The sentences of one prose line from `from`; with `complete` false, the tail after the last sentence is held back. */
function proseUnits(text: string, from: number, lineEnd: number, complete: boolean): SpeechUnit[] {
  const units: SpeechUnit[] = []
  const line = text.slice(from, lineEnd)
  let cursor = 0
  SENTENCE_END.lastIndex = 0
  for (let m = SENTENCE_END.exec(line); m; m = SENTENCE_END.exec(line)) {
    const endInLine = m.index + m[0].length
    // A sentence end needs the space after it in the text, which on the last line of a stream may not be there yet.
    if (endInLine >= line.length && !complete) break
    const lead = line.slice(cursor).search(/\S/)
    if (lead >= 0 && cursor + lead < endInLine) {
      const u = unit(line.slice(cursor + lead, endInLine), from + cursor + lead, from + endInLine)
      if (u) units.push(u)
    }
    cursor = endInLine
  }
  if (complete) {
    const rest = line.slice(cursor)
    const lead = rest.search(/\S/)
    if (lead >= 0) {
      const trimmedEnd = cursor + rest.trimEnd().length
      const u = unit(line.slice(cursor + lead, trimmedEnd), from + cursor + lead, from + trimmedEnd)
      if (u) units.push(u)
    }
  }
  return units
}

export function speechUnits(text: string, final: boolean): SpeechUnit[] {
  const units: SpeechUnit[] = []
  let inFence = false
  let shown: { start: number; title: string; spoken: SpeechUnit | null; lineCount: number } | null = null
  let pos = 0
  while (pos <= text.length) {
    const newline = text.indexOf('\n', pos)
    const lineEnd = newline === -1 ? text.length : newline
    const complete = newline !== -1 || final
    const line = text.slice(pos, lineEnd)
    if (newline === -1 && line === '' && !final) break

    if (shown) {
      if (shown.lineCount === 0) {
        if (!complete) break
        const spoken = line.startsWith('>') ? line.slice(1).trim() : ''
        const said = spoken || `I've put ${shown.title} in the thread.`
        const end = spoken ? lineEnd : pos - 1
        shown.spoken = { text: stripMarkup(said), start: shown.start, end }
        units.push(shown.spoken)
        shown.lineCount = 1
        if (spoken) { pos = lineEnd + 1; continue }
      }
      if (complete && SHOWN_CLOSE.test(line)) {
        shown.spoken!.blockEnd = lineEnd
        shown = null
      } else if (!complete) {
        break
      }
    } else if (inFence) {
      if (!complete) break
      if (FENCE.test(line)) inFence = false
    } else if (!complete && UNSURE_START.test(line)) {
      break
    } else if (ENCOURAGEMENT_LINE.test(line)) {
      // An encouragement response's mark: not said.
    } else {
      const open = SHOWN_OPEN.exec(line)
      if (open && complete) {
        shown = { start: pos, title: open[1]!.trim() || 'Shown', spoken: null, lineCount: 0 }
        if (newline === -1) {
          // The reply ended on the opening line: the part has no line of its own.
          const said = `I've put ${shown.title} in the thread.`
          units.push({ text: said, start: pos, end: lineEnd, blockEnd: lineEnd })
          shown = null
        }
      } else if (FENCE.test(line)) {
        if (!complete) break
        inFence = true
      } else if (!TABLE.test(line) && !RULE.test(line)) {
        const marker = LINE_MARKER.exec(line)
        units.push(...proseUnits(text, pos + (marker ? marker[0].length : 0), lineEnd, complete))
      }
    }
    if (newline === -1) break
    pos = newline + 1
  }
  if (final && shown && !shown.spoken) {
    units.push({ text: `I've put ${shown.title} in the thread.`, start: shown.start, end: text.length, blockEnd: text.length })
  } else if (final && shown?.spoken) {
    shown.spoken.blockEnd = text.length
  }
  return units
}

/**
 * What the person heard of a reply: the written text through the end of the last sentence they heard to its end
 * (`heardThrough`, -1 for none), a shown part kept whole.
 */
export function heardText(text: string, heardThrough: number): string {
  if (heardThrough < 0) return ''
  const units = speechUnits(text, true)
  const last = units[Math.min(heardThrough, units.length - 1)]
  if (!last) return ''
  return text.slice(0, last.blockEnd ?? last.end).trimEnd()
}
