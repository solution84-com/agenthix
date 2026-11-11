import { useState, type ReactNode, type RefObject } from 'react'
import { CircleHelp, MessageSquare } from 'lucide-react'
import { Button } from '../primitives/Button'
import { Tooltip } from '../primitives/Tooltip'
import { EmptyState } from '../primitives/EmptyState'
import { AgentAvatar } from '../sessions/SessionComponents'
import { PersonAvatar } from '../people/PersonAvatar'
import { MarkdownBox } from '../primitives/MarkdownBox'
import { replyParentId, threadComments } from './commentThreads'
import { whenText } from './taskRunLines'
import { FIELD, FOCUS_RING } from '../primitives/controlStyles'

export interface CommentLike {
  id: string
  content: string
  createdAt: string | Date
  authorType: 'AGENT' | 'USER' | string
  agentName?: string | null
  agentHandle?: string | null
  /** Who wrote a person's comment: their name, or "You" for the reader's own. */
  userName?: string | null
  /** The person who wrote it, for their avatar's colour. */
  userId?: string | null
  /** The top-level comment this one replies to; null or absent on a top-level comment. */
  parentId?: string | null
  /** Saved to the task from its conversation (*Save to the task*). */
  savedFromConversation?: boolean
}

export interface CommentsSectionProps<C extends CommentLike = CommentLike> {
  /** Caller is responsible for merging persisted + live and deduping. */
  comments: C[]
  /** Optional filter — return false to skip. Default: skip nothing. */
  filterComment?: (comment: C) => boolean
  /** Optional renderer for the comment body. Default: plain text. */
  renderContent?: (comment: C) => ReactNode

  commentDraft: string
  setCommentDraft: (v: string) => void
  commentBusy: boolean
  commentTextareaRef?: RefObject<HTMLTextAreaElement | null>
  /** Left out for someone who may not comment here, such as a project Viewer: then there is no comment box. */
  onAddComment?: () => void
  /** Why this person may not comment or reply: the box and Reply are then shown greyed with it as their tooltip. */
  cannotCommentReason?: string
  /** The comment box's hint; the default names the shortcut. */
  placeholder?: string
  /** Writes a reply under a top-level comment; resolves once it is kept. Left out, comments offer no Reply. */
  onReply?: (parentId: string, content: string) => Promise<void>
  /** How Write / Preview draws Markdown; given, the boxes are Markdown boxes with a toolbar. */
  renderMarkdown?: (text: string) => ReactNode
  /** What a comment is for, and where to go to get something done now: the tooltip of the ? beside "Markdown". */
  hint?: string
  /** The reader, so their own comments and the box carry their avatar rather than a "You". */
  me?: { userId: string; name: string } | null
  /** Today, for how a comment's time is written. */
  now?: Date
  /** The small "Comments" heading; off where a tab already names the section. */
  heading?: boolean
}

// The app's own avatars: an agent's coloured initials, a person's initial on the colour of their id.
function Avatar({ comment, name, me }: { comment: CommentLike; name: string; me?: CommentsSectionProps['me'] }) {
  if (comment.authorType === 'AGENT') return <span className="mt-0.5"><AgentAvatar name={name} size="sm" /></span>
  const own = me && (comment.userId === me.userId || (!comment.userId && name === 'You'))
  const person = own ? me : { userId: comment.userId ?? name, name }
  return <span className="mt-0.5"><PersonAvatar person={person} src={null} size="sm" /></span>
}

function nameOf(comment: CommentLike) {
  return comment.authorType === 'AGENT'
    ? (comment.agentName ?? comment.agentHandle ?? 'Agent')
    : (comment.userName ?? 'You')
}

function OneComment<C extends CommentLike>({ comment, renderContent, onReply, cannotReply, me, now }: {
  comment: C
  renderContent?: (comment: C) => ReactNode
  onReply?: () => void
  /** Why Reply is greyed; left out with no `onReply`, there is no Reply. */
  cannotReply?: string
  me?: CommentsSectionProps['me']
  now: Date
}) {
  const name = nameOf(comment)
  return (
    <div id={`comment-${comment.id}`} className="flex gap-2.5" data-testid="task-comment">
      <Avatar comment={comment} name={name} me={me} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-small font-medium text-text-secondary">{name}</span>
          {comment.authorType === 'AGENT' && <span className="text-micro text-text-muted">Agent</span>}
          <time dateTime={new Date(comment.createdAt).toISOString()} className="text-micro text-text-muted">{whenText(comment.createdAt, now)}</time>
        </div>
        {comment.savedFromConversation && <p className="text-micro font-medium text-text-muted">Saved from the conversation</p>}
        {renderContent ? renderContent(comment) : <p className="whitespace-pre-wrap text-reading text-text-primary">{comment.content}</p>}
        {(onReply || cannotReply) && (
          <span title={onReply ? undefined : cannotReply} className="inline-block">
            <button
              type="button" onClick={onReply} disabled={!onReply}
              className="text-micro font-medium text-text-muted not-disabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 max-sm:min-h-11 disabled:shadow-none"
            >
              Reply
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

function ReplyBox({ onSend, onCancel, renderMarkdown }: {
  onSend: (content: string) => Promise<void>
  onCancel: () => void
  renderMarkdown?: (text: string) => ReactNode
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await onSend(text.trim())
      setText('')
      onCancel()
    } catch {
      // The caller says why; the reply stays in the box to send again.
    } finally {
      setBusy(false)
    }
  }
  const buttons = (
    <div className="ml-auto flex gap-2">
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button variant="secondary" disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? 'Replying…' : 'Reply'}</Button>
    </div>
  )
  if (renderMarkdown) {
    return <MarkdownBox value={text} onChange={setText} renderPreview={renderMarkdown} label="Reply" placeholder="Write a reply… (Markdown)" onSubmit={() => void send()} disabled={busy} autoFocus footer={buttons} />
  }
  return (
    <div className="space-y-2">
      <textarea
        aria-label="Reply" autoFocus value={text} rows={2} disabled={busy} placeholder="Write a reply…"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send() }}
        className={`${FIELD} w-full resize-none rounded-xl px-3 py-2 text-small`}
      />
      <div className="flex">{buttons}</div>
    </div>
  )
}

/**
 * A task's comments (T0): its record, threaded one level deep, each shown formatted, with Reply under a thread and a
 * box at the end. A reply to a reply goes under the thread's top comment.
 */
export function CommentsSection<C extends CommentLike>({
  comments, filterComment, renderContent, commentDraft, setCommentDraft, commentBusy, commentTextareaRef, onAddComment,
  cannotCommentReason, placeholder, onReply, renderMarkdown, hint, heading = true, me, now = new Date(),
}: CommentsSectionProps<C>) {
  const visible = filterComment ? comments.filter(filterComment) : comments
  const threads = threadComments(visible)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const reply = onReply ? (id: string) => () => setReplyingTo(replyParentId(visible, id)) : () => undefined
  const refused = onAddComment ? undefined : cannotCommentReason
  const cannotReply = onReply ? undefined : cannotCommentReason
  const addComment = onAddComment ?? (() => undefined)

  const submit = (
    <Button
      variant="secondary" onClick={addComment} disabled={!!refused || commentBusy || !commentDraft.trim()}
      title={refused ?? (commentDraft.trim() ? undefined : 'Write the comment first')} className="ml-auto"
    >
      {commentBusy ? 'Posting…' : 'Comment'}
    </Button>
  )

  const hintMark = hint && (
    <Tooltip label={hint} side="top">
      <button type="button" aria-label={hint} className={`flex h-6 w-6 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover max-sm:h-11 max-sm:w-11 hover:text-text-primary ${FOCUS_RING}`}>
        <CircleHelp size={13} aria-hidden />
      </button>
    </Tooltip>
  )

  return (
    <div className="space-y-4">
      {heading && (
        <p className="flex items-center gap-1.5 text-micro font-medium uppercase tracking-wide text-text-muted/70">
          <MessageSquare size={10} />
          Comments
        </p>
      )}

      <div className="space-y-4">
        {threads.length === 0 ? (
          <EmptyState variant="inline" title="No comments yet." />
        ) : threads.map(({ comment, replies }) => (
          <div key={comment.id} className="space-y-3" data-testid="comment-thread">
            <OneComment comment={comment} renderContent={renderContent} onReply={onReply ? reply(comment.id) : undefined} cannotReply={cannotReply} me={me} now={now} />
            {(replies.length > 0 || replyingTo === comment.id) && (
              <div className="ml-8 space-y-3 border-l border-border-subtle pl-4" data-testid="comment-replies">
                {replies.map(r => <OneComment key={r.id} comment={r} renderContent={renderContent} onReply={onReply ? reply(r.id) : undefined} cannotReply={cannotReply} me={me} now={now} />)}
                {replyingTo === comment.id && onReply && (
                  <ReplyBox onSend={content => onReply(comment.id, content)} onCancel={() => setReplyingTo(null)} renderMarkdown={renderMarkdown} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {(onAddComment || refused) && (
        <div className="flex gap-2.5" title={refused}>
          <span className="mt-0.5">
            {me ? <PersonAvatar person={me} src={null} size="sm" /> : <span aria-hidden className="block h-6 w-6 rounded-full bg-surface-3" />}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            {renderMarkdown ? (
              <MarkdownBox
                value={commentDraft} onChange={setCommentDraft} renderPreview={renderMarkdown} textareaRef={commentTextareaRef}
                label="Add a comment" placeholder={placeholder ?? 'Add a comment… (Markdown)'} onSubmit={addComment} disabled={!!refused}
                footer={<><span className="text-micro text-text-muted">Markdown</span>{hintMark}{submit}</>}
              />
            ) : (
              <>
                <textarea
                  ref={commentTextareaRef}
                  value={commentDraft}
                  onChange={(e) => {
                    setCommentDraft(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${e.target.scrollHeight}px`
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment() }}
                  disabled={!!refused}
                  placeholder={placeholder ?? 'Leave a comment… (⌘↵ to submit)'}
                  rows={2}
                  style={{ maxHeight: '10rem' }}
                  className={`${FIELD} w-full resize-none overflow-y-auto rounded-xl px-3 py-2.5 text-small text-text-secondary placeholder:text-text-muted/70 disabled:cursor-not-allowed`}
                />
                <div className="flex items-center gap-2">{hintMark}{submit}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
