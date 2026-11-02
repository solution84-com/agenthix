import { consumeRateLimit, giveBackRateLimit } from '../server/rateLimit'

/** Wrong current passwords allowed per person in a window, so a session left open cannot be used to guess it. */
export const WRONG_PASSWORD_LIMIT = 5
/** One budget for every place that checks the current password, so a stolen session gets 5 guesses in all. */
export const WRONG_PASSWORD_RULE = { max: WRONG_PASSWORD_LIMIT, windowMs: 15 * 60 * 1000 }
export const wrongPasswordKey = (userId: string) => `change-password:${userId}`

export type PasswordGuess = 'right' | 'wrong' | 'too-many'

/**
 * Checks the person's current password against their budget. The attempt is counted before `isRight` runs, so
 * guesses sent at once cannot all be checked before any of them is counted; a right password gives its count back.
 */
export async function guessPassword(userId: string, isRight: () => Promise<boolean>): Promise<PasswordGuess> {
  const key = wrongPasswordKey(userId)
  if (!(await consumeRateLimit(key, WRONG_PASSWORD_RULE))) return 'too-many'
  if (!(await isRight())) return 'wrong'
  await giveBackRateLimit(key)
  return 'right'
}
