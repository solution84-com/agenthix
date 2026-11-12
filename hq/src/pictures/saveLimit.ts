/**
 * Saving a picture costs the server a render and four files (spec: *Making a picture costs the server*), so every save —
 * the picker's and the agent tool's — counts against one limit per person.
 */
import { consumeRateLimit, type RateLimitRule } from '../server/rateLimit'

export const PICTURE_SAVE_LIMIT: RateLimitRule = { max: 30, windowMs: 60_000 }

/** True when this person may save another picture now; the save is counted. */
export function takePictureSave(userId: string): Promise<boolean> {
  return consumeRateLimit(`picture-save:${userId}`, PICTURE_SAVE_LIMIT)
}
