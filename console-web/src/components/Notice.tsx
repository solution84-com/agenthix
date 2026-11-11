import type { ReactNode } from 'react'
import { useAttentionWhen } from '@agenthix/ui/attention'
import type { AttentionAction } from '@agenthix/ui/primitives'

/** A state's tone, kept where the wording of a state carries one; a notice itself no longer draws it. */
export type NoticeTone = 'neutral' | 'healthy' | 'warning' | 'danger'

/**
 * Something a person must know about this page. It is never drawn in the page: it opens the attention dialog once
 * when it appears (and again when it says something new), with Try again when there is a way and any action of its
 * own. A page that has nothing to add to what it already shows renders no notice.
 */
export function Notice({ title, children, retry, actions }: {
  title?: ReactNode
  children: ReactNode
  retry?: () => void
  actions?: AttentionAction[]
}) {
  return <>{useAttentionWhen(children, { title: typeof title === 'string' ? title : undefined, retry, actions })}</>
}
