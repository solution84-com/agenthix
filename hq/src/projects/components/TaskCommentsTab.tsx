import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, getTaskComments, addTaskComment } from 'wasp/client/operations'
import { useSocket, useSocketListener } from 'wasp/client/webSocket'
import { useAuth } from 'wasp/client/auth'
import { CommentsSection, type CommentLike } from '@agenthix/ui/tasks'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { useAttention } from '../../shared/components/AttentionDialog'
import { refusalText } from '../../shared/refusal'
import { isManifestApprovalComment } from './ManifestApprovalComment'
import { useSignedInPerson } from '../../shared/components/sidebar/useSignedInPerson'
import { VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'

type ListedComment = CommentLike & { agent?: { name: string; handle: string } | null }

/** A task's comments as the tab shows them: the run's approval markers left out, which the task's *Now* shows. */
export function shownComments(comments: ListedComment[]): CommentLike[] {
  return comments
    .filter(c => !isManifestApprovalComment(c.content))
    .map(c => ({ ...c, agentName: c.agentName ?? c.agent?.name ?? null, agentHandle: c.agentHandle ?? c.agent?.handle ?? null }))
}

/**
 * The task page's Comments tab (T0): the task's record, threaded one level, written in Markdown, read by every run.
 * Under the box, what a comment is for and *Talk about this task* for getting something done now. A comment that
 * cannot be kept opens the attention dialog with Try again; one that is kept just appears.
 */
export function TaskCommentsTab({ taskId, taskKey, agentName, canComment, embed, focusCommentId }: {
  taskId: string
  taskKey: string
  agentName?: string | null
  canComment: boolean
  embed?: MarkdownEmbedContext
  /** A comment to bring into view, from the address (an Activity line's *See in Comments*). */
  focusCommentId?: string | null
}) {
  const query = useQuery(getTaskComments, { taskId })
  const { data, refetch } = query
  const read = useBackgroundRead(query, { what: 'The comments' })
  const add = useCallback((args: { taskId: string; content: string; parentId?: string | null }) => addTaskComment(args), [])
  const { socket, isConnected } = useSocket()
  const attention = useAttention()
  const { data: user } = useAuth()
  const { username } = useSignedInPerson()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isConnected && socket) socket.emit('subscribeToTask', taskId as never)
  }, [isConnected, socket, taskId])
  useSocketListener('taskCommentAdded', useCallback((c: { taskId?: string }) => { if (c.taskId === taskId) void refetch() }, [taskId, refetch]))

  const comments = shownComments((data ?? []) as ListedComment[])
  useEffect(() => {
    if (focusCommentId) document.getElementById(`comment-${focusCommentId}`)?.scrollIntoView?.({ block: 'center' })
  }, [focusCommentId, comments.length])

  const post = async () => {
    const content = draft.trim()
    if (!content || busy) return
    setBusy(true)
    try {
      await add({ taskId, content })
      setDraft('')
      await refetch()
    } catch (err) {
      attention.show({ title: 'Could not add the comment', text: refusalText(err), retry: () => void post() })
    } finally {
      setBusy(false)
    }
  }
  const reply = async (parentId: string, content: string) => {
    try {
      await add({ taskId, content, parentId })
      await refetch()
    } catch (err) {
      attention.show({ title: 'Could not add the reply', text: refusalText(err), retry: () => void reply(parentId, content) })
      throw err
    }
  }
  const markdown = (text: string) => <MarkdownMessage content={text} embed={embed} />

  if (!data && read.failedWithoutData) return <>{read.nudge}</>

  return (
    <>
      {read.nudge}
      <CommentsSection
        heading={false}
        comments={comments}
        renderContent={c => <MarkdownMessage content={c.content} className="text-reading" embed={embed} />}
        renderMarkdown={markdown}
        commentDraft={draft}
        setCommentDraft={setDraft}
        commentBusy={busy}
        commentTextareaRef={box}
        onAddComment={canComment ? () => void post() : undefined}
        onReply={canComment ? reply : undefined}
        cannotCommentReason={canComment ? undefined : VIEWER_CANNOT_WORK}
        placeholder={`Add a comment for the task’s record…${agentName ? ` ${agentName} reads it on its next run.` : ''}`}
        hint="For the task’s record: people and every run read it. To get something answered or done now, use Talk about this task."
        me={user ? { userId: user.id, name: username } : null}
      />
      {attention.dialog}
    </>
  )
}
