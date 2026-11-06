import { useAction, approveManifest, rejectManifest } from 'wasp/client/operations'
import { ManifestApprovalBubble, type PendingManifestData } from '@agenthix/ui/sessions'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'

export interface WaitingSession {
  id: string
  agentName: string
  runCount: number
}

/**
 * The request waiting for an okay, in a task's Now (T0): the request card, Approve or Deny, for the next run only.
 * The header has no second Approve.
 */
export function TaskWaiting({ session, pending, onSettled, readOnly = false }: {
  session: WaitingSession | null
  pending: PendingManifestData | null
  onOpenSession?: () => void
  onSettled: () => void
  /** The person only reads here (a project Viewer): the request is shown as waiting, with nothing to answer it. */
  readOnly?: boolean
}) {
  const approveFn = useAction(approveManifest)
  const rejectFn = useAction(rejectManifest)
  const agentName = session?.agentName ?? 'The agent'
  if (readOnly) {
    return (
      <p className="rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 text-small text-text-muted">
        {agentName} is waiting for someone who works in this project to answer its request.
      </p>
    )
  }
  if (!pending) {
    return (
      <p className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-small text-text-secondary">
        {agentName} is waiting for your okay. Its request is loading…
      </p>
    )
  }
  return (
    <ManifestApprovalBubble
      agentName={agentName}
      data={pending}
      actions={{ approveManifest: approveFn as never, rejectManifest: rejectFn as never }}
      onSettled={onSettled}
      renderMarkdown={p => <MarkdownMessage content={p.content} className={p.className} />}
    />
  )
}
