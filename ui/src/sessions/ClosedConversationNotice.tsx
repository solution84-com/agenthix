/**
 * What a closed conversation shows in place of its message box (adr-0076): why
 * it is closed, and a way to start a new conversation with the same agent.
 *
 * Presentational only. The words are composed by the app — `closedConversationCopy`
 * in hq, which tests it. What starting a new conversation does is the
 * app's too.
 */
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '../primitives/Button'

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
  return (
    <div className="border-t border-border-subtle p-3 shrink-0" role="status">
      <p className="text-body font-medium text-text-primary">{copy.headline}</p>
      <p className="mt-1 text-small leading-relaxed text-text-secondary">{copy.detail}</p>
      <Button
        type="button"
        size="sm"
        className="mt-3"
        onClick={onStartNew}
        disabled={starting}
        leadingIcon={<MessageSquarePlus className="w-3 h-3" />}
      >
        {copy.action}
      </Button>
    </div>
  )
}
