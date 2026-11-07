/** How close to the bottom counts as reading the newest, so new text follows along, in pixels. */
export const NEAR_BOTTOM = 160
/** The gap kept above the start of an answer it opens at, in pixels. */
const ABOVE_ANSWER = 8

/**
 * Where the thread scrolls to follow new words: the bottom, unless the newest answer is taller than the view, in
 * which case its start, so a new answer opens where it begins and the person reads down. `answerTop` is the
 * answer's top edge in the scrolled content.
 */
export function followTarget(box: { scrollHeight: number; clientHeight: number }, answerTop: number | null): number {
  const bottom = Math.max(0, box.scrollHeight - box.clientHeight)
  return answerTop === null ? bottom : Math.max(0, Math.min(bottom, answerTop - ABOVE_ANSWER))
}

/** The newest answer's top edge in the scrolled content of `box`, or null when there is none. */
export function newestAnswerTop(box: HTMLElement): number | null {
  const turns = box.querySelectorAll<HTMLElement>('[data-turn]')
  const last = turns[turns.length - 1]
  if (!last) return null
  return last.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
}
