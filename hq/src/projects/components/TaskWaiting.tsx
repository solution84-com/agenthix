import { forwardRef } from 'react'
import { useAction, approveManifest, rejectManifest } from 'wasp/client/operations'
import { ManifestApprovalBubble, type PendingManifestData } from '@agenthix/ui/sessions'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'

export interface WaitingSession {
  id: string
  agentName: string
  runCount: number
}

/**
 * What waits in a task's session (every screen reviewed spec §3): the pending
 * tool request, answered in place, and Open session for the whole transcript.
 */
export const TaskWaiting = forwardRef<HTMLElement, {
  session: WaitingSession | null
  pending: PendingManifestData | null
  onOpenSession: () => void
  onSettled: () => void
  /** The person only reads here (a project Viewer): a tool request is shown as waiting, with nothing to answer it. */
  readOnly?: boolean
}>(function TaskWaiting({ session, pending, onOpenSession, onSettled, readOnly = false }, ref) {
  const approveFn = useAction(approveManifest)
  const rejectFn = useAction(rejectManifest)
  return (
    <section ref={ref} aria-label="Session" className="space-y-2 rounded-xl border border-border-subtle p-3">
      <div className="flex flex-wrap items-center gap-x-2">
        <h4 className="text-micro font-medium uppercase tracking-wide text-text-muted">Session</h4>
        {session && (
          <span className="text-small text-text-muted">
            · {session.agentName} · {session.runCount} run{session.runCount === 1 ? '' : 's'}{pending ? (readOnly ? ' · a tool request is waiting' : ' · waiting for you') : ''}
          </span>
        )}
        {session && (
          <button type="button" onClick={onOpenSession} className="ml-auto text-small text-accent hover:underline">Open session ›</button>
        )}
      </div>
      {pending && readOnly ? (
        <p className="text-small text-text-muted">A tool request is waiting for someone who works in this project to answer it.</p>
      ) : pending ? (
        <ManifestApprovalBubble
          data={pending}
          actions={{ approveManifest: approveFn as never, rejectManifest: rejectFn as never }}
          onSettled={onSettled}
          renderMarkdown={p => <MarkdownMessage content={p.content} className={p.className} />}
        />
      ) : (
        <p className="text-small text-text-muted">
          {session ? 'Nothing is waiting for you in the session.' : 'No session yet. Run the task to start one.'}
        </p>
      )}
    </section>
  )
})
