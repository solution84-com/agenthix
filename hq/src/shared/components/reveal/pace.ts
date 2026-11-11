/**
 * The reveal's numbers, in one place. A reply being revealed has one position, in characters of its text; it follows
 * a target on a critically damped spring, and each character fades in from the moment the position passes it.
 */
export const REVEAL = {
  /** In voice, the target is where the voice will be this long from now, so a word is read just before it is heard. */
  leadMs: 600,
  /** The spring's angular frequency (per second): higher follows the target more tightly. */
  omega: 14,
  /** How long a character takes to fade in once the position passes it (ease-out). */
  fadeMs: 280,
  /** Typed chat: the steady reading pace a burst is revealed at, in characters per millisecond (200 a second). */
  burstCharsPerMs: 0.2,
  /** Typed chat: the target speeds up beyond the reading pace so it never trails what arrived by much more than this. */
  maxLagMs: 1200,
  /** The longest step one frame may take, so a frame that comes late (a tab in the background) does not leap. */
  maxStepMs: 50,
} as const
