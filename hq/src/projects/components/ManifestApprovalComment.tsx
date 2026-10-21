import { useAction } from 'wasp/client/operations'
import { approveManifest, rejectManifest, getRunManifestStatus } from 'wasp/client/operations'
import {
  ManifestApprovalComment as LiftedManifestApprovalComment,
  isManifestApprovalComment,
} from '@agenthix/ui/sessions'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'

export { isManifestApprovalComment }

export function ManifestApprovalComment({ content, sessionId }: { content: string; sessionId: string }) {
  const approveFn = useAction(approveManifest)
  const rejectFn = useAction(rejectManifest)

  return (
    <LiftedManifestApprovalComment
      content={content}
      sessionId={sessionId}
      queries={{
        getRunManifestStatus: ((i: { runId: string; sessionId: string }) => getRunManifestStatus(i)) as never,
      }}
      actions={{
        approveManifest: approveFn as never,
        rejectManifest: rejectFn as never,
      }}
      renderMarkdown={(p) => <MarkdownMessage content={p.content} className={p.className} />}
    />
  )
}
