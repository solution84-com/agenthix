import { isFinal } from '@agenthix/ui/attention'

/**
 * Where a failed Save is said. A refusal of the typed value (a final answer: 400, 401, 403, 404, 409, 422) is the
 * field's own error; anything else — the network, a rate limit, HQ down — is the press's failure, said by the dialog.
 */
export function splitFailure(err: unknown, fallback: string): { field: string; press: string } {
  const words = err instanceof Error && err.message ? err.message : fallback
  return isFinal(err) ? { field: words, press: '' } : { field: '', press: words }
}
