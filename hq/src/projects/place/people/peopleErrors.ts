import { pressFailureWords } from '../../../shared/failureWords'

export function reasonOf(err: unknown, fallback: string): string {
  return pressFailureWords(err, fallback)
}
