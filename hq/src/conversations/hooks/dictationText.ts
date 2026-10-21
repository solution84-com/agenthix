/**
 * The message box's text while dictation is on. What the speech service hears goes into one span of the text —
 * every turn it has heard, in order — and each turn is rewritten in place as the service corrects it, so words
 * show as they are spoken and the formatted sentence replaces them where they stand. The person's own typing
 * outside the span is kept; typing inside it hands those words over to them.
 */

export type HeardTurn = { order: number; text: string; final: boolean }

export type DictationText = {
  text: string
  /** Where the heard words stand in `text`, separators included. */
  span: { start: number; length: number }
  turns: HeardTurn[]
  /**
   * Turns the person took over by editing inside the span: what of each was in the box then. Later words of the
   * same turn are added after it only when they carry on from it.
   */
  given: Record<number, string>
  lastOrder: number
}

export function beginDictation(text: string, at: number = text.length): DictationText {
  const start = Math.max(0, Math.min(at, text.length))
  return { text, span: { start, length: 0 }, turns: [], given: {}, lastOrder: -1 }
}

function spanText(turns: HeardTurn[], before: string, after: string): string {
  const words = turns.map(t => t.text.trim()).filter(Boolean).join(' ')
  if (!words) return ''
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const tail = /^[\p{L}\p{N}]/u.test(after) ? ' ' : ''
  return `${lead}${words}${tail}`
}

function render(state: DictationText, turns: HeardTurn[]): DictationText {
  const { start, length } = state.span
  const before = state.text.slice(0, start)
  const after = state.text.slice(start + length)
  const middle = spanText(turns, before, after)
  return { ...state, text: before + middle + after, span: { start, length: middle.length }, turns }
}

/** One message from the service: the latest words of turn `order`, which supersede that turn's earlier words. */
export function hearSpeech(state: DictationText, heard: { text: string; order: number | null; final: boolean }): DictationText {
  const order = heard.order ?? Math.max(state.lastOrder, 0)
  let text = heard.text.trim()
  const lastOrder = Math.max(state.lastOrder, order)
  const given = state.given[order]
  if (given !== undefined) {
    if (!text.toLowerCase().startsWith(given.toLowerCase())) return { ...state, lastOrder }
    text = text.slice(given.length).trim()
  }
  const turns = state.turns.filter(t => t.order !== order)
  turns.push({ order, text, final: heard.final })
  turns.sort((a, b) => a.order - b.order)
  return render({ ...state, lastOrder }, turns)
}

/**
 * The person changed the box. An edit before the span moves it; one after leaves it; one that touches it gives
 * the words heard so far to the person, and words heard later start a new span after them.
 */
export function editText(state: DictationText, next: string): DictationText {
  const prev = state.text
  if (next === prev) return state
  let head = 0
  while (head < prev.length && head < next.length && prev[head] === next[head]) head++
  let tail = 0
  while (tail < prev.length - head && tail < next.length - head && prev[prev.length - 1 - tail] === next[next.length - 1 - tail]) tail++
  let removedEnd = prev.length - tail
  // A typed or deleted run could equally stand further left; take the leftmost, so typing just before the heard
  // words counts as before them.
  const inserted = next.length - tail - head
  if (removedEnd === head) while (head > 0 && prev[head - 1] === next[head - 1 + inserted]) { head--; removedEnd-- }
  else if (inserted === 0) while (head > 0 && prev[head - 1] === prev[removedEnd - 1]) { head--; removedEnd-- }
  const delta = next.length - prev.length
  const { start, length } = state.span
  const end = start + length

  if (removedEnd <= start) return { ...state, text: next, span: { start: start + delta, length } }
  if (head > end) return { ...state, text: next }

  const given = { ...state.given }
  for (const turn of state.turns) {
    if (!turn.text) continue
    given[turn.order] = given[turn.order] ? `${given[turn.order]} ${turn.text}` : turn.text
  }
  const newStart = Math.max(end + delta, head + inserted)
  return { ...state, text: next, span: { start: Math.min(Math.max(newStart, 0), next.length), length: 0 }, turns: [], given }
}

/** Whether a turn has words the service has not yet finished. */
export function turnOpen(state: DictationText): boolean {
  return state.turns.some(t => !t.final && t.text)
}

/** Where a position in the old text stands after the span was rewritten: the cursor is kept. */
export function movePosition(before: DictationText, after: DictationText, position: number): number {
  const start = before.span.start
  const end = start + before.span.length
  if (position < start) return position
  if (position >= end) return position + (after.text.length - before.text.length)
  return after.span.start + after.span.length
}
