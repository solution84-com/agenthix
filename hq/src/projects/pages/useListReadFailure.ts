import { useEffect } from 'react'
import { readFailure } from '@agenthix/ui/attention'
import type { Attention } from '@agenthix/ui/primitives'

/**
 * A task list that HQ did not answer: the attention dialog opens once with Try again, and the caller shows the list's
 * place empty with the same Try again. True while the read has failed.
 */
export function useListReadFailure(error: unknown, retry: () => void, show: (a: Attention) => void): boolean {
  const failed = !!error
  useEffect(() => {
    if (failed) show(readFailure('The tasks', retry))
  }, [failed]) // eslint-disable-line react-hooks/exhaustive-deps
  return failed
}
