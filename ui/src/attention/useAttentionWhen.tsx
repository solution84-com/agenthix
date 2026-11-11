import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react'
import { AttentionDialog, type Attention } from '../primitives'

/** What the dialog may be handed: words, a node, or a failure (an `Error`, or anything with a `message`). */
export type AttentionText = ReactNode | Error | { message: string } | unknown

export type WhenOptions = Omit<Attention, 'text'> & {
  /** Called when the dialog closes, so a caller that holds the failure in its state clears it. */
  onClose?: () => void
}

function asNode(text: unknown): ReactNode {
  if (text === null || text === undefined || text === false || text === true || text === '') return null
  if (typeof text === 'string' || typeof text === 'number') return String(text)
  if (isValidElement(text) || Array.isArray(text)) return text as ReactNode
  if (text instanceof Error) return text.message
  if (typeof text === 'object' && typeof (text as { message?: unknown }).message === 'string') return (text as { message: string }).message
  return String(text)
}

/** The words of a node, to tell whether it says something new. */
export function wordsOf(node: ReactNode): string {
  return Children.toArray(node).map(c => {
    if (typeof c === 'string' || typeof c === 'number') return String(c)
    return isValidElement<{ children?: ReactNode }>(c) ? wordsOf(c.props.children) : ''
  }).join('')
}

/**
 * Opens the attention dialog when `text` becomes words, and again when the words change (or clear and come back);
 * render the returned node once, anywhere. For a component that is handed a failure to say (an `error` prop, a failed
 * query, or a failure it keeps in its own state): a message about the screen is never drawn in the content's layout.
 * The dialog keeps what it said until it is closed.
 */
export function useAttentionWhen(text: AttentionText, { onClose, ...rest }: WhenOptions = {}): ReactNode {
  const [shown, setShown] = useState<Attention | null>(null)
  const node = asNode(text)
  const key = node === null ? '' : wordsOf(node) || 'node'
  useEffect(() => {
    if (node !== null) setShown({ ...rest, text: node })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return <AttentionDialog attention={shown} onClose={() => { setShown(null); onClose?.() }} />
}

/**
 * The same as a component, for a place a hook cannot go (an early `return`): drop it where the failure's words were.
 * It draws nothing in the layout.
 */
export function ShowAttention({ text, ...options }: { text: AttentionText } & WhenOptions): ReactNode {
  return useAttentionWhen(text, options)
}
