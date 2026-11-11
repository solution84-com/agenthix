/** The reveal's motion, pure: the spring the position moves on, the typed target's pace, and a character's fade. */
import { REVEAL } from './pace'

export type Spring = { x: number; v: number }

/**
 * One step of a critically damped spring towards `target`, `dt` seconds long. It never passes the target: it eases
 * into it and holds there, and picks up again smoothly when the target moves on.
 */
export function springStep({ x, v }: Spring, target: number, dt: number, omega: number): Spring {
  const a = omega * omega * (target - x) - 2 * omega * v
  const nv = v + a * dt
  const nx = x + nv * dt
  // Across the target, or close enough that what is left cannot be seen: there.
  if ((target - x) * (target - nx) <= 0 || (Math.abs(target - nx) < 0.01 && Math.abs(nv) < 0.05)) return { x: target, v: 0 }
  return { x: nx, v: nv }
}

/**
 * Typed chat: where the target moves to in `dtMs`, towards `arrived` (the end of the text that may show). It moves at
 * the steady reading pace, faster when it is further behind than `maxLagMs` of that backlog would clear: a burst glides
 * in, and a slow stream is followed as it arrives.
 */
export function typedGoal(goal: number, arrived: number, dtMs: number): number {
  if (goal >= arrived) return arrived
  const rate = Math.max(REVEAL.burstCharsPerMs, (arrived - goal) / REVEAL.maxLagMs)
  return Math.min(arrived, goal + rate * dtMs)
}

/** How far a character passed at `passedAt` has faded in at `now`, 0 to 1, easing out. */
export function fadeOf(passedAt: number, now: number): number {
  const k = Math.max(0, Math.min(1, (now - passedAt) / REVEAL.fadeMs))
  return 1 - (1 - k) * (1 - k)
}

/** The end of the last whole word of a text still arriving: a word half arrived may still grow and wrap. */
export function lastWordEnd(text: string): number {
  return /\s$/.test(text) ? text.length : text.search(/\S*$/)
}
