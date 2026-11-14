import { pressFailureWords } from '../../shared/failureWords'

/** What a failed operation says, for a screen to show: its own sentence, or a plain fallback that changed nothing. */
export function messageOf(err: unknown, fallback = 'That did not work. Nothing was changed.'): string {
  return pressFailureWords(err, fallback)
}
