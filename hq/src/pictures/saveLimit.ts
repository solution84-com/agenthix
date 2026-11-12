/**
 * Saving a picture costs the server a render and four files (spec: *Making a picture costs the server*), so every save —
 * the picker's and the agent tool's — counts against one limit per person.
 */
import { HttpError } from 'wasp/server'
import { consumeRateLimit, type RateLimitRule } from '../server/rateLimit'

export const PICTURE_SAVE_LIMIT: RateLimitRule = { max: 30, windowMs: 60_000 }

export const TOO_MANY_SAVES = 'That is many pictures saved in a minute. Wait a minute, then save again. Nothing was changed.'

/** Refuses with 429 once this person has saved the limit's pictures this minute; otherwise counts this one. */
export async function requirePictureSave(userId: string): Promise<void> {
  if (!(await takePictureSave(userId))) throw new HttpError(429, TOO_MANY_SAVES)
}

/** True when this person may save another picture now; the save is counted. */
export function takePictureSave(userId: string): Promise<boolean> {
  return consumeRateLimit(`picture-save:${userId}`, PICTURE_SAVE_LIMIT)
}
