import { type ReactNode, type RefObject } from 'react'
import { Bot, MessageSquare } from 'lucide-react'

export interface CommentLike {
  id: string
  content: string
  createdAt: string | Date
  authorType: 'AGENT' | 'USER' | string
  agentName?: string | null
  agentHandle?: string | null
  /** Who wrote a person's comment: their name, or "You" for the reader's own. */
  userName?: string | null
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
}

export function CommentsSection<C extends CommentLike>({
  comments,
  filterComment,
  renderContent,
  commentDraft,
  setCommentDraft,
  commentBusy,
  commentTextareaRef,
  onAddComment,
  placeholder,
}: CommentsSectionProps<C>) {
  const visible = filterComment ? comments.filter(filterComment) : comments

  return (
    <div className="space-y-4">
      <p className="text-micro font-medium uppercase tracking-wide text-text-muted/70 flex items-center gap-1.5">
        <MessageSquare size={10} />
        Comments
      </p>

      <div className="space-y-4">
        {visible.length === 0 ? (
          <p className="text-small text-text-muted/70 italic">No comments yet.</p>
        ) : (
          visible.map((comment) => {
            const isAgent = comment.authorType === 'AGENT'
            const displayName = isAgent
              ? (comment.agentName ?? comment.agentHandle ?? 'Agent')
              : (comment.userName ?? 'You')
            return (
              <div key={comment.id} className="flex gap-2.5">
                <div
                  className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-micro font-medium mt-0.5 ${
                    isAgent ? 'bg-accent/20 text-accent' : 'bg-surface-3 text-text-secondary'
                  }`}
                >
                  {isAgent ? <Bot size={11} /> : displayName[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-small font-medium text-text-secondary">{displayName}</span>
                    {isAgent && (
                      <span className="text-micro font-medium text-accent/50 bg-accent/8 px-1.5 py-0.5 rounded border border-accent/15">
                        agent
                      </span>
                    )}
                    <span className="text-micro text-text-muted/70">
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {renderContent ? (
                    renderContent(comment)
                  ) : (
                    <p className="text-reading text-text-primary whitespace-pre-wrap">{comment.content}</p>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {onAddComment && <div className="flex gap-2.5">
        <div className="w-6 h-6 rounded-full shrink-0 bg-surface-3 flex items-center justify-center text-micro font-medium text-text-secondary mt-0.5">
          Y
        </div>
        <div className="flex-1 space-y-2">
          <textarea
            ref={commentTextareaRef}
            value={commentDraft}
            onChange={(e) => {
              setCommentDraft(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onAddComment()
            }}
            placeholder={placeholder ?? 'Leave a comment… (⌘↵ to submit)'}
            rows={2}
            style={{ maxHeight: '10rem' }}
            className="w-full bg-surface-1 border border-border-subtle rounded-xl px-3 py-2.5 text-small text-text-secondary resize-none overflow-y-auto focus:outline-none focus:ring-1 focus:ring-accent/40 transition-colors placeholder:text-text-muted/70"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onAddComment}
              disabled={commentBusy || !commentDraft.trim()}
              className="px-2.5 py-1 rounded-lg text-micro font-medium bg-accent/15 hover:bg-accent/25 text-accent border border-accent/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {commentBusy ? 'Posting…' : 'Comment'}
            </button>
          </div>
        </div>
      </div>}
    </div>
  )
}
