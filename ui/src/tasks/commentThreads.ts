/** What threading needs of a comment: its id, the comment it replies to, and when it was written. */
export interface ThreadableComment {
  id: string
  parentId?: string | null
  createdAt: string | Date
}

export interface CommentThread<C extends ThreadableComment> {
  comment: C
  /** Oldest first. */
  replies: C[]
}

const time = (d: string | Date) => new Date(d).getTime()

/**
 * A task's comments as threads one level deep, oldest first: each top-level comment with its replies under it. A
 * reply to a reply belongs to the top comment of its thread; a reply whose comment is not in the list stands as a
 * top-level comment of its own, so nothing written is hidden.
 */
export function threadComments<C extends ThreadableComment>(comments: C[]): CommentThread<C>[] {
  const byId = new Map(comments.map(c => [c.id, c]))
  const rootOf = (c: C): C => {
    const seen = new Set<string>()
    let at = c
    while (at.parentId && byId.has(at.parentId) && !seen.has(at.id)) {
      seen.add(at.id)
      at = byId.get(at.parentId)!
    }
    return at
  }
  const ordered = [...comments].sort((a, b) => time(a.createdAt) - time(b.createdAt))
  const threads = new Map<string, CommentThread<C>>()
  for (const c of ordered) {
    const root = rootOf(c)
    if (root.id === c.id) threads.set(c.id, { comment: c, replies: threads.get(c.id)?.replies ?? [] })
    else {
      const thread = threads.get(root.id) ?? { comment: root, replies: [] }
      thread.replies.push(c)
      threads.set(root.id, thread)
    }
  }
  return [...threads.values()].sort((a, b) => time(a.comment.createdAt) - time(b.comment.createdAt))
}

/** The comment a reply is written under: the top comment of the thread the person replied in. */
export function replyParentId<C extends ThreadableComment>(comments: C[], repliedToId: string): string {
  const byId = new Map(comments.map(c => [c.id, c]))
  let at = byId.get(repliedToId)
  const seen = new Set<string>()
  while (at?.parentId && byId.has(at.parentId) && !seen.has(at.id)) {
    seen.add(at.id)
    at = byId.get(at.parentId)
  }
  return at?.id ?? repliedToId
}
