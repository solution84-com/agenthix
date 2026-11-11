import { useId, type MouseEvent, type ReactNode } from 'react'
import { useAttention, type AttentionAction } from './AttentionDialog'

/**
 * Why a control cannot be used now, known before it is pressed: `reason` is the short line in its tooltip and its
 * accessible description; a press opens the attention dialog with `title`, `detail` (the reason when there is none)
 * and `actions`, what the person can do about it.
 */
export type Refusal = { reason: string; title?: string; detail?: ReactNode; actions?: AttentionAction[] }

export interface RefusedProps {
  'aria-disabled'?: true
  'aria-describedby'?: string
  onClick?: (e: MouseEvent) => void
}

const DEFAULT_TITLE = 'Not available now'

/**
 * A control refused for a reason known in advance. Spread `props` after the control's own (they replace its
 * `onClick`), wrap it in `<Tooltip label={tooltip} wrap>`, and render `dialog` once. The control is `aria-disabled`,
 * never `disabled`, so it stays focusable, its tooltip shows on hover and focus, and its press is caught. Without a
 * refusal, `props` is empty and the control works as usual. A control with hover classes of its own drops them while
 * refused (`withoutHover`), as `Button` does.
 */
export function useRefusal(refusal?: Refusal): { props: RefusedProps; tooltip?: string; dialog: ReactNode } {
  const { show, dialog } = useAttention()
  const id = useId()
  if (!refusal) return { props: {}, dialog }
  const { reason, title, detail, actions } = refusal
  return {
    props: {
      'aria-disabled': true,
      'aria-describedby': id,
      onClick: e => { e.preventDefault(); show({ title: title ?? DEFAULT_TITLE, text: detail ?? reason, actions }) },
    },
    tooltip: reason,
    dialog: <><span id={id} hidden>{reason}</span>{dialog}</>,
  }
}
