import { useState, type ReactNode, type RefObject } from 'react'
import { Bot, MessageSquare } from 'lucide-react'
import { Button } from '../primitives/Button'
import { MarkdownBox } from './MarkdownBox'
import { replyParentId, threadComments } from './commentThreads'

export interface CommentLike {
  id: string
  content: string
  createdAt: string | Date
  authorType: 'AGENT' | 'USER' | string
  agentName?: string | null
  agentHandle?: string | null
  /** Who wrote a person's comment: their name, or "You" for the reader's own. */
  userName?: string | null
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
  /** The comment box's hint; the default names the shortcut. */
  placeholder?: string
  /** Writes a reply under a top-level comment; resolves once it is kept. Left out, comments offer no Reply. */
  onReply?: (parentId: string, content: string) => Promise<void>
  /** How Write / Preview draws Markdown; given, the boxes are Markdown boxes with a toolbar. */
  renderMarkdown?: (text: string) => ReactNode
  /** Under the box: what a comment is for, and where to go to get something done now. */
  hint?: ReactNode
  /** The small "Comments" heading; off where a tab already names the section. */
  heading?: boolean
}

function Avatar({ comment, name }: { comment: CommentLike; name: string }) {
  const isAgent = comment.authorType === 'AGENT'
  return (
    <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-micro font-medium ${isAgent ? 'bg-accent/20 text-accent' : 'bg-surface-3 text-text-secondary'}`}>
      {isAgent ? <Bot size={11} /> : name[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

function nameOf(comment: CommentLike) {
  return comment.authorType === 'AGENT'
    ? (comment.agentName ?? comment.agentHandle ?? 'Agent')
    : (comment.userName ?? 'You')
}

function OneComment<C extends CommentLike>({ comment, renderContent, onReply }: {
  comment: C
  renderContent?: (comment: C) => ReactNode
  onReply?: () => void
}) {
  const name = nameOf(comment)
  return (
    <div id={`comment-${comment.id}`} className="flex gap-2.5" data-testid="task-comment">
      <Avatar comment={comment} name={name} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-small font-medium text-text-secondary">{name}</span>
          {comment.authorType === 'AGENT' && (
            <span className="rounded border border-accent/15 bg-accent/8 px-1.5 py-0.5 text-micro font-medium text-accent/50">agent</span>
          )}
          <span className="text-micro text-text-muted/70">{new Date(comment.createdAt).toLocaleString()}</span>
        </div>
        {comment.savedFromConversation && <p className="text-micro font-medium text-text-muted">Saved from the conversation</p>}
        {renderContent ? renderContent(comment) : <p className="whitespace-pre-wrap text-reading text-text-primary">{comment.content}</p>}
        {onReply && (
          <button type="button" onClick={onReply} className="text-micro font-medium text-text-muted hover:text-text-primary max-lg:min-h-10">
            Reply
          </button>
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
      <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
      <Button variant="secondary" size="sm" disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? 'Replying…' : 'Reply'}</Button>
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
        className="w-full resize-none rounded-xl border border-border-subtle bg-surface-1 px-3 py-2 text-small text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
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
  placeholder, onReply, renderMarkdown, hint, heading = true,
}: CommentsSectionProps<C>) {
  const visible = filterComment ? comments.filter(filterComment) : comments
  const threads = threadComments(visible)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const reply = onReply ? (id: string) => () => setReplyingTo(replyParentId(visible, id)) : () => undefined

  const submit = (
    <Button variant="secondary" size="sm" onClick={onAddComment} disabled={commentBusy || !commentDraft.trim()} className="ml-auto">
      {commentBusy ? 'Posting…' : 'Comment'}
    </Button>
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
          <p className="text-small italic text-text-muted/70">No comments yet.</p>
        ) : threads.map(({ comment, replies }) => (
          <div key={comment.id} className="space-y-3" data-testid="comment-thread">
            <OneComment comment={comment} renderContent={renderContent} onReply={onReply ? reply(comment.id) : undefined} />
            {(replies.length > 0 || replyingTo === comment.id) && (
              <div className="ml-8 space-y-3 border-l border-border-subtle pl-4" data-testid="comment-replies">
                {replies.map(r => <OneComment key={r.id} comment={r} renderContent={renderContent} onReply={onReply ? reply(r.id) : undefined} />)}
                {replyingTo === comment.id && onReply && (
                  <ReplyBox onSend={content => onReply(comment.id, content)} onCancel={() => setReplyingTo(null)} renderMarkdown={renderMarkdown} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {onAddComment && (
        <div className="flex gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-micro font-medium text-text-secondary">Y</div>
          <div className="min-w-0 flex-1 space-y-2">
            {renderMarkdown ? (
              <MarkdownBox
                value={commentDraft} onChange={setCommentDraft} renderPreview={renderMarkdown} textareaRef={commentTextareaRef}
                label="Add a comment" placeholder={placeholder ?? 'Add a comment… (Markdown)'} onSubmit={onAddComment}
                footer={<><span className="text-micro text-text-muted">Markdown</span>{submit}</>}
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
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onAddComment() }}
                  placeholder={placeholder ?? 'Leave a comment… (⌘↵ to submit)'}
                  rows={2}
                  style={{ maxHeight: '10rem' }}
                  className="w-full resize-none overflow-y-auto rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5 text-small text-text-secondary transition-colors placeholder:text-text-muted/70 focus:outline-none focus:ring-1 focus:ring-accent/40"
                />
                <div className="flex">{submit}</div>
              </>
            )}
            {hint && <div className="text-micro text-text-muted">{hint}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
