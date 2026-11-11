import type { ReactNode } from 'react'
import { useAttentionWhen, type NudgePlace } from '@agenthix/ui/attention'
import type { AttentionAction } from '@agenthix/ui/primitives'

/** A state's tone, kept where the wording of a state carries one; a notice itself no longer draws it. */
export type NoticeTone = 'neutral' | 'healthy' | 'warning' | 'danger'

/**
 * Something a person must know about this page, said as its `kind` says (ui/DESIGN-SYSTEM.md, *Messages*): `alert`
 * opens the attention dialog once when it appears (and again when it says something new), for a press that failed;
 * `nudge` is a quiet line where it is rendered (`place`), for anything the person did not just press. Try again when
 * there is a way. A page that has nothing to add to what it already shows renders no notice.
 */
export function Notice({ kind, place, title, children, retry, actions }: {
  kind: 'alert' | 'nudge'
  place?: NudgePlace
  title?: ReactNode
  children: ReactNode
  retry?: () => void
  actions?: AttentionAction[]
}) {
  return <>{useAttentionWhen(children, { kind, place, title: typeof title === 'string' ? title : undefined, retry, actions })}</>
}
