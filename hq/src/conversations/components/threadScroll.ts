/**
 * How the thread follows the words being revealed, pure: the line being revealed is held just above the message box
 * floating over the thread (one line above the usual gap in typed chat, three lines above the box in voice), and the
 * view glides with the reveal. Only the person, scrolling up, lets go; scrolling back down to the line follows again.
 * And the room kept under the thread's last line for it.
 */

/** The reading text's line height (`--text-reading--line-height`), in pixels. */
export const LINE_PX = 25
/** In voice, the line being revealed is held this many lines above the message box. */
export const READING_LINES = 3
/** The room under the last line at rest, beyond the message box: the gap between two messages. */
export const REST_GAP = 20
/** In voice, the room under the line being revealed, beyond the message box: the reading lines. */
export const READING_ROOM = READING_LINES * LINE_PX
/** What a reply's buttons take under it (ReplyActions: 32 px, 44 px below the `lg` width) when there are none to measure. */
export const ACTIONS_PX = 32
export const ACTIONS_PX_NARROW = 44

/**
 * How a reply is shown: `typed`, its newest line held one line above the usual gap, the line its buttons appear into
 * at its end; `voice`, its line being revealed held three lines above the box, so it is read a little ahead of the
 * voice. Chosen when the reply starts and kept until it has ended, so switching between typed chat and voice moves
 * nothing.
 */
export type ReplyKind = 'typed' | 'voice'

/** The room under the line being revealed, beyond the message box, for a reply of `kind` (`actions`: its buttons' height). */
export const replyGap = (kind: ReplyKind, actions: number = ACTIONS_PX): number =>
  kind === 'voice' ? READING_ROOM : REST_GAP + actions

/**
 * Where the room under the last line is: `rest`, the usual gap; `reply`, while a reply runs, streams, is revealed or
 * waits for its voice, the reply's room (`replyGap`); `after`, once it has ended, what is left of it once what came
 * under its last line (its buttons) has taken its share.
 */
export type RoomPhase = 'rest' | 'reply' | 'after'

/** The room under the last line: the box's height and the phase's gap (`whole`, the reply's); `grown`, what came under it. */
export function roomFor(phase: RoomPhase, box: number, grown = 0, whole = replyGap('typed')): number {
  if (phase === 'rest') return box + REST_GAP
  if (phase === 'reply') return box + whole
  return box + Math.max(REST_GAP, whole - Math.max(0, grown))
}

/** The room's phase and the reply's kind, its gap beyond the box, and the bottom of the line followed last in the reply. */
export type Room = { phase: RoomPhase; kind: ReplyKind; gap: number; anchor: number }
export const AT_REST: Room = { phase: 'rest', kind: 'typed', gap: REST_GAP, anchor: 0 }

/**
 * The room after a change: `active` while a reply is being shown, `hidden` while the thread is not shown, `line` the
 * followed line's bottom now (the end of the content, with nothing revealed), `voice` whether voice is on, `actions`
 * what a reply's buttons take. Once a reply has ended its room only shrinks, by what came under the line followed last,
 * so the end of the room stays where it was and nothing moves.
 */
export function nextRoom(room: Room, now: { active: boolean; hidden: boolean; line: number; voice?: boolean; actions?: number }): Room {
  const actions = now.actions ?? ACTIONS_PX
  if (now.active) {
    const kind: ReplyKind = room.phase === 'reply' ? room.kind : now.voice ? 'voice' : 'typed'
    return { phase: 'reply', kind, gap: replyGap(kind, actions), anchor: now.line }
  }
  if (now.hidden || room.phase === 'rest') return AT_REST
  const gap = roomFor('after', 0, now.line - room.anchor, room.phase === 'reply' ? room.gap : replyGap(room.kind, actions))
  return { ...room, phase: 'after', gap: room.phase === 'after' ? Math.min(room.gap, gap) : gap }
}

/**
 * Whether what is left of a reply's room goes back to the usual gap: all at once, and only when it is out of sight
 * below the view (`max` the furthest the thread scrolls, `top` where it is), so taking it away moves nothing.
 */
export const releasesRoom = (room: Room, max: number, top: number): boolean =>
  room.phase === 'after' && max - top >= room.gap - REST_GAP

/** The reading line for a reply of `kind`: its room above `foot` (the top of the message box, in the thread's view). */
export const readingLineAt = (foot: number, kind: ReplyKind = 'voice', actions = ACTIONS_PX): number => foot - replyGap(kind, actions)

/** Where the thread scrolls to: the followed point (`lineBottom`, in the scrolled content) on the reading line, within what can be scrolled. */
export function followTarget(lineBottom: number, readingLine: number, maxScroll: number): number {
  return Math.max(0, Math.min(Math.max(0, maxScroll), lineBottom - readingLine))
}

/** In voice, the view moves a line at a time: each step to the next line takes this long, then the view holds still. */
export const LINE_STEP_MS = 180

/** A longer move (the person's words going to the top) takes this long. */
export const LONG_STEP_MS = 420
/** In voice, the person's latest words are held this far below the top of the view, the reply written under them. */
export const PIN_MARGIN = 16

/** One step of the voice follow: from `from` to `to`, started at `at`, taking `ms`. */
export type LineStep = { from: number; to: number; at: number; ms: number }

/** A step from `from` to `to` at `at`: a line's step is short, a longer move a little slower. */
export const lineStep = (from: number, to: number, at: number): LineStep =>
  ({ from, to, at, ms: Math.abs(to - from) > 3 * LINE_PX ? LONG_STEP_MS : LINE_STEP_MS })

/** Where a line step is at `now`: eased out, so it starts quickly and settles; `to` once it has taken `LINE_STEP_MS`. */
export function stepAt(step: LineStep, now: number): number {
  const t = Math.max(0, Math.min(1, (now - step.at) / step.ms))
  return step.from + (step.to - step.from) * (1 - Math.pow(1 - t, 3))
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
