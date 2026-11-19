/**
 * The lines heard at the head of the reply awaited (adaptive voice listening, the light model): hq starts the reply's
 * message with the lines the person heard since a reply last took them, but says so only once the reply is written
 * (`heardPrefix`). Until then the bubble shows each line as it begins to play, so it is never empty while one is heard.
 *
 * Lines said while the person's turn is still open (a hum, an invitation, a presence check) have no turn yet: they are
 * published with no turn, and drawn as the agent's bubble of their own, after the words said before the first of them.
 * That bubble becomes the message that ends the turn: the turn running while voice is on takes them, from its start to
 * when it is done with. A turn withdrawn or held leaves them to the next, as hq does. A turn closed with a line (by the
 * light model, or at the "not yet" limit) holds its lines and that line in its own message: they stay bound to it, the
 * closing line joining them as it begins, until the next line or turn.
 */
import type { VoiceSnapshot } from '../voiceSnapshot'

const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0)

export function createHeading(snapshot: () => VoiceSnapshot, set: (patch: Partial<VoiceSnapshot>) => void) {
  /** The lines begun since a reply last took them, in order. */
  let lines: string[] = []
  let lastLineId: string | null = null
  /** The turn the lines will head: the one running, or the one a line closed. */
  let awaited: string | null = null
  /** The person's words being said that came before the first line; null: after all of them. */
  let wordsBefore: number | null = null
  /** The turn closed by a line: `awaited` holds its lines alone, and anything after starts afresh. */
  let closedTurn: string | null = null
  /** A line that closed a turn: it joins that turn's lines, never the next one's. */
  const closing = new Set<string>()

  const publish = () => {
    const heard = lines.map(l => l.trim()).filter(Boolean).join(' ')
    const next = heard ? { turnId: awaited, heard, wordsBefore } : null
    const now = snapshot().heading ?? null
    if (now?.turnId === next?.turnId && now?.heard === next?.heard && now?.wordsBefore === next?.wordsBefore) return
    set({ heading: next })
  }
  /** What a closed turn held is its message's: what comes next starts with nothing. */
  const leaveClosed = () => {
    lines = []
    awaited = null
    closedTurn = null
    wordsBefore = null
  }

  return {
    /** A light model's line began to play. */
    lineStarted(lineId: string, text: string) {
      if (lineId === lastLineId) return
      lastLineId = lineId
      if (closing.has(lineId)) {
        if (closedTurn !== null) { lines.push(text); publish() }
        return
      }
      if (closedTurn !== null) leaveClosed()
      if (lines.length === 0 && awaited === null) wordsBefore = snapshot().partial.trim() ? wordCount(snapshot().partial) : null
      lines.push(text)
      publish()
    },
    /** A turn runs: the lines heard so far, and those to come, head it. */
    running(turnId: string) {
      if (closedTurn !== null && closedTurn !== turnId) leaveClosed()
      awaited = turnId
      publish()
    },
    /**
     * The person's turn was closed by `lineId`: the lines heard are in turn `turnId`'s message with it. With no turn
     * named, they are taken and nothing heads anything.
     */
    closed(lineId: string | undefined, turnId: string | undefined) {
      if (lineId) closing.add(lineId)
      while (closing.size > 8) closing.delete(closing.values().next().value!)
      if (!turnId) {
        leaveClosed()
        publish()
        return
      }
      closedTurn = turnId
      awaited = turnId
      publish()
    },
    /** Voice is done with the turn's reply. `taken`: hq put the lines in its message; otherwise they head the next. */
    done(turnId: string, taken: boolean) {
      if (closedTurn === turnId) return
      if (taken) {
        lines = []
        wordsBefore = null
      } else if (awaited === turnId) {
        // Withdrawn: the person's turn is open again, and what they say next comes after the lines.
        wordsBefore = 0
      }
      if (awaited === turnId) awaited = null
      publish()
    },
    reset() {
      leaveClosed()
      lastLineId = null
      closing.clear()
    },
  }
}
