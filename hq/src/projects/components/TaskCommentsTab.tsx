import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, getTaskComments, addTaskComment } from 'wasp/client/operations'
import { useSocket, useSocketListener } from 'wasp/client/webSocket'
import { CommentsSection, type CommentLike } from '@agenthix/ui/tasks'
import { MarkdownMessage, type MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import { useAttention } from '../../shared/components/AttentionDialog'
import { refusalText } from '../../shared/refusal'
import { isManifestApprovalComment } from './ManifestApprovalComment'
import { useTalkAboutTask } from './TaskThreadSection'

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
  const { data, refetch } = useQuery(getTaskComments, { taskId })
  const add = useCallback((args: { taskId: string; content: string; parentId?: string | null }) => addTaskComment(args), [])
  const { socket, isConnected } = useSocket()
  const attention = useAttention()
  const talk = useTalkAboutTask(taskId, taskKey)
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

  return (
    <>
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
        placeholder={`Add a comment… (Markdown)${agentName ? ` ${agentName} reads it on its next run.` : ''}`}
        hint={
          <>
            For the task&apos;s record: people and every run read it. To get something answered or done now, use{' '}
            {talk && !talk.refusal
              ? <button type="button" onClick={talk.open} className="text-accent hover:underline">Talk about this task</button>
              : <span>Talk about this task</span>}
            .
          </>
        }
      />
      {attention.dialog}
    </>
  )
}
