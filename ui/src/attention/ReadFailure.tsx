import { useEffect, type ReactNode } from 'react'
import { useAttention, type Attention } from '../primitives'

/** What a read that was not answered says: `what` is the thing, as "The agents". */
export function readFailure(what: string, retry?: () => void): Attention {
  return { title: `${what} could not be read`, text: 'HQ did not answer. Nothing was changed.', retry }
}

/**
 * A read HQ did not answer. Render it in place of the content that could not be shown: the dialog opens, with Try
 * again where there is a way, and the place stays empty (the caller's empty state, or nothing). Pass the query's
 * `error` so that a retry that fails again opens it again.
 */
export function ReadFailure({ what, retry, error }: { what: string; retry?: () => void; error?: unknown }): ReactNode {
  const { show, dialog } = useAttention()
  useEffect(() => show(readFailure(what, retry)), [error]) // eslint-disable-line react-hooks/exhaustive-deps
  return dialog
}
