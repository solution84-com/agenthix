import { pressFailureWords } from './failureWords'

/** A refused action's reason, in words, wherever it is shown: the server's own reason, or the fallback when it gave none. */
export function refusalText(err: unknown, fallback = 'That did not work. Try again.'): string {
  return pressFailureWords(err, fallback).trim() || fallback
}
