/**
 * The three rules every turn's card is checked against (the Log as turns). A step that breaks one is marked
 * `should not happen`:
 * 1. YOU comes first in a turn.
 * 2. A LIGHT check always follows some of your words: a check after a pause, new words since the check before it; a
 *    check after SOUND finished, new words or SOUND since the check before it.
 * 3. A turn ends (LIGHT `close_turn` or `hand_over`, SYSTEM `hand_over`) only after SOUND `finished`, or after a long
 *    quiet that follows a "not yet".
 */
import type { CardStep, LogStep } from './logModel'

export const RULES: Record<1 | 2 | 3, string> = {
  1: 'YOU comes first in a turn.',
  2: 'A LIGHT check always follows some of your words.',
  3: 'A turn ends only after SOUND finished, or after a long quiet that follows a “not yet”.',
}

export function checkRules<T extends LogStep>(steps: readonly T[]): (T & Pick<CardStep, 'ruleBroken'>)[] {
  let you = false
  let finished = false
  // Since the check before.
  let youSince = false
  let soundSince = false
  const followsWords = (s: LogStep) => {
    const moment = s.attrs?.moment
    if (moment === 'quietAfterWords') return youSince
    if (moment === 'soundsFinished') return youSince || soundSince
    return you
  }
  return steps.map((s, i) => {
    const broken = i === 0 && s.actor !== 'YOU' ? 1
      : s.check && !followsWords(s) ? 2
      : s.ends && !finished && !s.afterNotYet ? 3
      : undefined
    if (s.actor === 'YOU') { you = true; youSince = true }
    if (s.actor === 'SOUND' && s.tag === 'finished') { finished = true; soundSince = true }
    if (s.check) { youSince = false; soundSince = false }
    return broken ? { ...s, ruleBroken: broken } : { ...s }
  })
}
