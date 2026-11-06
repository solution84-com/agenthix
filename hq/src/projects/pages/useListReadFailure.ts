import { useEffect } from 'react'
import type { Attention } from '../../shared/components/AttentionDialog'

/**
 * A task list that HQ did not answer: the attention dialog opens once with Try again, and the caller shows the list's
 * place empty with the same Try again. True while the read has failed.
 */
export function useListReadFailure(error: unknown, retry: () => void, show: (a: Attention) => void): boolean {
  const failed = !!error
  useEffect(() => {
    if (failed) show({ title: 'The tasks could not be read', text: 'HQ did not answer. Nothing was changed.', retry })
  }, [failed]) // eslint-disable-line react-hooks/exhaustive-deps
  return failed
}
