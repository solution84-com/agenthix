/**
 * How the thread follows the words being revealed, pure: the line being revealed is held a few lines above the box
 * floating over the thread, and the view eases to it a line at a time. Only the person, scrolling up, lets go; scrolling
 * back down to the line follows again.
 */

/** The reading text's line height (`--text-reading--line-height`), in pixels. */
export const LINE_PX = 25
/** The line being revealed is held this many lines above the floating box. */
export const READING_LINES = 3
/** The follow's spring (per second): it eases into each new line in about 0.7 s and then holds still. */
export const FOLLOW_OMEGA = 5

/**
 * The room the thread keeps under its last line: the floating box's height and the reading lines, so the last line can
 * reach the reading line. The same in typed chat and in voice, so switching between them moves nothing.
 */
export const endSpaceFor = (floatingHeight: number): number => floatingHeight + READING_LINES * LINE_PX

/** The reading line, `READING_LINES` lines above `foot` (the top of the floating box, in the thread's view). */
export const readingLineAt = (foot: number): number => foot - READING_LINES * LINE_PX

/**
 * Where the thread scrolls to: the revealed line's bottom (`lineBottom`, in the scrolled content) on the reading line,
 * within what can be scrolled. It changes only when the reveal starts a new line, so the view moves a line at a time.
 */
export function followTarget(lineBottom: number, readingLine: number, maxScroll: number): number {
  return Math.max(0, Math.min(Math.max(0, maxScroll), lineBottom - readingLine))
}

/**
 * Where the follow holds the view: `aim`, but not back up past `floor`, where the view was when text was taken away
 * under the followed line (the words an interruption cut), so taking text away leaves the view where it is.
 */
export function heldAim(aim: number, floor: number | null, maxScroll: number): number {
  return floor === null ? aim : Math.max(aim, Math.min(floor, Math.max(0, maxScroll)))
}

/** How long the person's scrolling, momentum included, must have stopped before the follow moves the view again. */
export const SCROLL_REST_MS = 150

/** What the person did on the thread. */
export type ThreadInput =
  | { kind: 'wheel'; deltaY: number }
  | { kind: 'touch' }
  | { kind: 'key'; key: string }
  /** A press on the thread itself rather than its content: its scroll bar. */
  | { kind: 'press'; onScrollBar: boolean }

const UP_KEYS = new Set(['ArrowUp', 'PageUp', 'Home'])

/** Whether the person's input lets go of the follow: only theirs, and only towards older messages. */
export function letsGo(input: ThreadInput): boolean {
  switch (input.kind) {
    case 'wheel': return input.deltaY < 0
    case 'touch': return true
    case 'key': return UP_KEYS.has(input.key)
    case 'press': return input.onScrollBar
  }
}

/**
 * Whether a scroll comes back to following: the person (not the follow itself, which set `lastSet`) scrolled down until
 * the revealed line (`lineBottom`) is in view, even behind the box.
 */
export function comesBack(a: { top: number; lastTop: number; lastSet: number; lineBottom: number; viewHeight: number }): boolean {
  const own = Math.abs(a.top - a.lastSet) < 2
  return !own && a.top > a.lastTop && a.lineBottom - a.top <= a.viewHeight
}
