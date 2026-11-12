import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react'
import { AttentionDialog, type Attention } from '../primitives'
import { isDemoRefusal } from '../primitives/demoRefusal'
import { Nudge, type NudgePlace } from './Nudge'

/** What the dialog may be handed: words, a node, or a failure (an `Error`, or anything with a `message`). */
export type AttentionText = ReactNode | Error | { message: string } | unknown

export type WhenOptions = Omit<Attention, 'text'> & {
  /**
   * How it is said (DESIGN-SYSTEM.md, *Messages*): `alert`, the dialog, for a press that failed or typed work about to
   * be lost; `nudge`, a quiet line in the page (`place`), for anything the person did not just press.
   */
  kind: 'alert' | 'nudge'
  /** Where a nudge sits; `meta` when not given. A nudge in place of the content takes `title` as its first line. */
  place?: NudgePlace
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
 * Says `text` when it becomes words, for a component that is handed a failure (an `error` prop, a failed query, or a
 * failure it keeps in its own state). `kind: 'alert'` opens the attention dialog, again when the words change (or clear
 * and come back), and keeps what it said until it is closed; render the returned node once, anywhere. `kind: 'nudge'`
 * returns the nudge itself, to render where it sits: it shows while there are words and goes when they clear. A failure
 * that is the public demo's refusal (`demo: true`) is final, so it is said without Try again.
 */
export function useAttentionWhen(text: AttentionText, { kind, place = 'meta', onClose, ...options }: WhenOptions): ReactNode {
  const rest = isDemoRefusal(text) ? { ...options, retry: undefined } : options
  const [shown, setShown] = useState<Attention | null>(null)
  const node = asNode(text)
  const key = node === null ? '' : wordsOf(node) || 'node'
  useEffect(() => {
    if (kind === 'alert' && node !== null) setShown({ ...rest, text: node })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (kind === 'nudge') {
    if (node === null) return null
    const action = rest.retry ? { label: 'Try again', onClick: rest.retry } : rest.actions?.[0]
    return <Nudge place={place} title={rest.title} action={action}>{node}</Nudge>
  }
  return <AttentionDialog attention={shown} onClose={() => { setShown(null); onClose?.() }} />
}

/**
 * The same as a component, for a place a hook cannot go (an early `return`): drop it where the failure's words were.
 * As `alert` it draws nothing in the layout; as `nudge` it is the nudge, in that place.
 */
export function ShowAttention({ text, ...options }: { text: AttentionText } & WhenOptions): ReactNode {
  return useAttentionWhen(text, options)
}
