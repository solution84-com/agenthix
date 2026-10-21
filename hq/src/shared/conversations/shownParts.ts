/**
 * Shown parts (conversational experience spec, Voice › Shown parts): what must be seen, in a reply that may be
 * spoken. The lead writes one as a block of its own lines:
 *
 *     :::shown The three steps
 *     > I've put a diagram in the thread that shows the three steps; tap it to open.
 *     …the body, in ordinary markup…
 *     :::
 *
 * Voice speaks the `>` line in place of the body; the screen shows a card that opens the body (in voice mode) or
 * the body inline (outside it). One parser for both, client-safe. An unclosed part runs to the end of the text, so
 * a reply still streaming parses as it will when it ends.
 *
 * A reply that only asks the person to go on, when their words trailed off (adaptive voice spec, Orchestration §5),
 * opens with the line `:::encouragement`: hq marks the reply as one and the line is never shown or said.
 */

export type ShownPart = { title: string; spoken: string; body: string }
export type ReplySegment = { kind: 'prose'; text: string } | { kind: 'shown'; part: ShownPart }

const OPEN = /^:::shown[ \t]*(.*)$/
const CLOSE = /^:::[ \t]*$/
export const ENCOURAGEMENT_LINE = /^:::encouragement[ \t]*$/

/** The reply opens with the encouragement line: it is an encouragement response, asking the person to go on. */
export function isEncouragement(text: string): boolean {
  return ENCOURAGEMENT_LINE.test(text.trimStart().split('\n', 1)[0] ?? '')
}

/** The reply without its encouragement line. */
export function withoutEncouragementLine(text: string): string {
  return text.split('\n').filter(line => !ENCOURAGEMENT_LINE.test(line)).join('\n').trim()
}

export function splitShownParts(text: string): ReplySegment[] {
  const lines = text.split('\n')
  const segments: ReplySegment[] = []
  let prose: string[] = []
  let i = 0
  const flushProse = () => {
    const joined = prose.join('\n')
    if (joined.trim()) segments.push({ kind: 'prose', text: joined })
    prose = []
  }
  while (i < lines.length) {
    if (ENCOURAGEMENT_LINE.test(lines[i]!)) { i++; continue }
    const open = OPEN.exec(lines[i]!)
    if (!open) { prose.push(lines[i]!); i++; continue }
    flushProse()
    const title = open[1]!.trim() || 'Shown'
    i++
    let spoken = ''
    if (i < lines.length && lines[i]!.startsWith('>')) { spoken = lines[i]!.slice(1).trim(); i++ }
    const body: string[] = []
    while (i < lines.length && !CLOSE.test(lines[i]!)) { body.push(lines[i]!); i++ }
    if (i < lines.length) i++ // the closing line
    segments.push({ kind: 'shown', part: { title, spoken: spoken || `I've put ${title} in the thread.`, body: body.join('\n') } })
  }
  flushProse()
  return segments
}

/** What voice reads of a reply: prose as written and each shown part's spoken line in its place. */
export function spokenText(text: string): string {
  return splitShownParts(text).map(s => (s.kind === 'prose' ? s.text : s.part.spoken)).join('\n\n')
}
