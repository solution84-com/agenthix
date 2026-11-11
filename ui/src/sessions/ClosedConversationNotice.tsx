/**
 * What a closed conversation shows in place of its message box (adr-0076): why
 * it is closed, and a way to start a new conversation with the same agent.
 *
 * Presentational only. The words are composed by the app — `closedConversationCopy`
 * in hq, which tests it. What starting a new conversation does is the
 * app's too.
 */
import { FIELD, FOCUS_RING, withoutHover } from '../primitives/controlStyles'
import { Tooltip } from '../primitives/Tooltip'
import { useRefusal } from '../primitives/useRefusal'

export interface ClosedConversationNoticeCopy {
  headline: string
  detail: string
  action: string
}

export interface ClosedConversationNoticeProps {
  copy: ClosedConversationNoticeCopy
  onStartNew: () => void
  /** True while the new conversation is being created. */
  starting?: boolean
}

export function ClosedConversationNotice({ copy, onStartNew, starting }: ClosedConversationNoticeProps) {
  // The message box stays, greyed: its tooltip says the conversation is closed, and a press opens the way on.
  const refused = useRefusal({
    reason: copy.headline,
    title: copy.headline,
    detail: copy.detail,
    actions: starting ? undefined : [{ label: copy.action, variant: 'primary', onClick: onStartNew }],
  })
  return (
    <div className="border-t border-border-subtle p-3 shrink-0">
      <Tooltip label={refused.tooltip ?? ''} wrap side="top">
        <button
          type="button"
          {...refused.props}
          className={`${withoutHover(FIELD)} w-full rounded-xl px-3 py-2.5 text-left text-body text-text-muted ${FOCUS_RING}`}
        >
          {copy.headline}
        </button>
      </Tooltip>
      {refused.dialog}
    </div>
  )
}
