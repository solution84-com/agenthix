import { useContext, useEffect, useId, type ReactNode } from 'react'
import { ShowAttention } from '@agenthix/ui/attention'
import { threadLine, ThreadNudgesContext } from '../hooks/useThreadNudges'

/**
 * A failure of an action drawn inside a conversation (a card's button, the model, the places), handed in as words:
 * in an open thread it is the line after the last message (handler 9), with Try again when `retry` is given; outside
 * one (G5) it is the dialog, as any press that failed. The line goes when the words clear, or when this leaves.
 */
export function ThreadFailure({ text, title, retry, onClose }: {
  text: string | null | undefined
  /** What did not happen, as "The model was not changed". */
  title: string
  retry?: () => void
  /** Clears the caller's words, outside a thread when the dialog closes. */
  onClose?: () => void
}): ReactNode {
  const thread = useContext(ThreadNudgesContext)
  const key = useId()
  const words = text || null
  useEffect(() => {
    if (!thread) return
    if (words) thread.push({ key, text: threadLine(title, words), retry })
    else thread.clear(key)
    // `retry` is a new function each render; the line keeps the one it was pushed with until the words change.
  }, [thread, key, words, title]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => (thread ? () => thread.clear(key) : undefined), [thread, key])
  if (thread) return null
  return <ShowAttention kind="alert" text={words} title={title} retry={retry} onClose={onClose} />
}
