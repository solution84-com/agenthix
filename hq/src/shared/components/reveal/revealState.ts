/**
 * A reply's reveal as one position in its text, in characters, and when each character was passed. Only text past
 * what was already shown is revealed, judged by place in the text, so a block drawn again never replays. Pure, and
 * changed in place: it lives in a ref and is advanced once a frame.
 */
import { REVEAL } from './pace'
import { fadeOf, lastWordEnd, springStep, typedGoal } from './motion'

export type RevealState = {
  /** The text laid out, as last seen. */
  text: string
  /** The shown position and its speed (characters per second). */
  x: number
  v: number
  /** Typed chat: the paced target the position follows. */
  goal: number
  /** When it was last advanced (ms), null before the first frame. */
  last: number | null
  /** Every character before `base` is shown and settled; `passed[i]` is when character `base + i` was passed. */
  base: number
  passed: number[]
}

/** What the reveal aims at this frame. */
export type Aim = {
  /** Where the voice will be (`REVEAL.leadMs` ahead), in characters; null in typed chat, where it is the text's end. */
  target: number | null
  /** The text is still arriving: a half-arrived last word waits until it is whole. */
  live: boolean
  /** Reduced motion: no spring and no fade. */
  reduced: boolean
}

/** A reveal of `text`: from its start while it is arriving, or already whole (a message loaded whole shows at once). */
/** `settled`: how much of an arriving text was already on screen elsewhere, so it does not reveal again. */
export function startReveal(text: string, arriving: boolean, settled = 0): RevealState {
  const at = arriving ? Math.min(Math.max(0, settled), text.length) : text.length
  return { text, x: at, v: 0, goal: at, last: null, base: at, passed: [] }
}

function commonPrefix(a: string, b: string): number {
  if (b.startsWith(a)) return a.length
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++
  return i
}

/** Whether `text` is the reveal's text carried on (or cut short), so the reveal can carry on over it. */
export function carriesOn(s: RevealState, text: string): boolean {
  return text.startsWith(s.text) || s.text.startsWith(text)
}

/**
 * The laid-out text is now `text`. What it keeps of the last text stays as it was; what changed or was cut (the voice
 * stopped: only what was heard stays) drops at once, and reveals again from there if it comes back.
 */
export function relayOut(s: RevealState, text: string): void {
  if (text === s.text) return
  const kept = commonPrefix(s.text, text)
  s.text = text
  if (s.x <= kept) return
  s.x = kept
  s.v = 0
  s.goal = Math.min(s.goal, kept)
  s.base = Math.min(s.base, kept)
  s.passed.length = Math.max(0, kept - s.base)
}

/** Where the position heads: the voice's place, or in typed chat the end of what may show. */
function ceiling(s: RevealState, aim: Aim): number {
  const laid = s.text.length
  if (aim.target !== null) return Math.max(0, Math.min(aim.target, laid))
  return aim.live ? lastWordEnd(s.text) : laid
}

/** Moves the reveal on to `now` (ms): the target, the spring, and the characters the position passes. */
export function advance(s: RevealState, aim: Aim, now: number): void {
  const dtMs = s.last === null ? 0 : Math.max(0, Math.min(REVEAL.maxStepMs, now - s.last))
  s.last = now
  const top = ceiling(s, aim)
  if (aim.reduced) {
    s.goal = top
    s.x = Math.max(s.x, top)
    s.v = 0
  } else {
    s.goal = aim.target !== null ? top : typedGoal(s.goal, top, dtMs)
    const next = springStep({ x: s.x, v: s.v }, s.goal, dtMs / 1000, REVEAL.omega)
    s.x = next.x
    s.v = next.v
  }
  // A character is passed once the position is halfway across it.
  const across = Math.min(s.text.length, Math.floor(s.x + 0.5))
  while (s.base + s.passed.length < across) s.passed.push(now)
}

/** How visible character `i` is at `now`: 0 until the position passes it, then fading in (at once under reduced motion). */
export function opacityAt(s: RevealState, i: number, now: number, reduced: boolean): number {
  if (i < s.base) return 1
  const at = s.passed[i - s.base]
  if (at === undefined) return 0
  return reduced ? 1 : fadeOf(at, now)
}

/** Folds the characters that have finished fading into `base`; returns the first character still changing. */
export function settle(s: RevealState, now: number): number {
  let n = 0
  while (n < s.passed.length && s.passed[n]! + REVEAL.fadeMs <= now) n++
  if (n > 0) {
    s.passed.splice(0, n)
    s.base += n
  }
  return s.base
}

/** Nothing is left to move: the position is at its target, which will not move without new text, and every fade is done. */
export function atRest(s: RevealState, aim: Aim, now: number): boolean {
  const top = ceiling(s, aim)
  if (s.x < top || s.goal < top) return false
  const lastPass = s.passed[s.passed.length - 1]
  return lastPass === undefined || aim.reduced || lastPass + REVEAL.fadeMs <= now
}

/** The characters passed so far: the revealed line is the one holding the last of them. */
export const passedTo = (s: RevealState): number => s.base + s.passed.length
