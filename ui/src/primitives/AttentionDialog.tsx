import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { Modal } from './Modal'
import type { ButtonVariant } from './buttonStyles'
import { saysDemoRefusal } from './demoRefusal'

/** A button of the dialog's own, such as "Use Sonnet" or "Start a new conversation": it closes the dialog, then runs. */
export type AttentionAction = { label: string; onClick: () => void; variant?: ButtonVariant }

/** What needs the person's attention: a failure or a refusal, in words, and what to do again when there is a way. */
export type Attention = { title?: string; text: ReactNode; retry?: () => void; actions?: AttentionAction[] }

const DEFAULT_TITLE = 'That did not work'

/**
 * The one way a screen asks for the person's attention (a message is never part of the content's layout): a dialog
 * in the centre of the screen with a title, the words, Close, the caller's own actions, and Try again where the caller
 * gives a way to retry. A result the screen already shows gets no message; a refusal known in advance is said by the
 * control instead (`useRefusal`), whose press opens this dialog. It is drawn at the body and its buttons never submit,
 * so it can be opened from anywhere, a form or a menu included (see `Layer`). The public demo's refusal is final until
 * the demo resets, so it never offers Try again.
 */
export function AttentionDialog({ attention, onClose }: { attention: Attention | null; onClose: () => void }) {
  if (!attention) return null
  const { actions = [] } = attention
  const retry = saysDemoRefusal(attention.text) ? undefined : attention.retry
  return createPortal(
    <Layer>
      <Modal open onClose={onClose} title={attention.title ?? DEFAULT_TITLE}>
        <div role="alert" data-testid="attention-text" className="break-words text-body text-text-primary">{attention.text}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          {actions.map(a => (
            <Button key={a.label} type="button" variant={a.variant ?? 'secondary'} onClick={() => { onClose(); a.onClick() }}>{a.label}</Button>
          ))}
          {retry && <Button type="button" onClick={() => { onClose(); retry() }}>Try again</Button>}
        </div>
      </Modal>
    </Layer>,
    document.body,
  )
}

/**
 * The dialog's layer at the body. A menu that closes on a press outside it listens for `mousedown` or `pointerdown` on
 * the document; a dialog opened from inside such a menu is outside it in the page, so a press on it would close the
 * menu and take the dialog (and its buttons' clicks) with it. The layer keeps those two presses to itself; clicks,
 * keys and focus are untouched, so nothing in the dialog is changed by it.
 */
function Layer({ children }: { children: ReactNode }) {
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = layer.current
    if (!el) return
    const keep = (e: Event) => e.stopPropagation()
    el.addEventListener('mousedown', keep)
    el.addEventListener('pointerdown', keep)
    return () => { el.removeEventListener('mousedown', keep); el.removeEventListener('pointerdown', keep) }
  }, [])
  return <div ref={layer} data-attention>{children}</div>
}

/** `show(...)` opens the dialog; render `dialog` once, anywhere. */
export function useAttention(): { show: (attention: Attention) => void; dialog: ReactNode } {
  const [attention, setAttention] = useState<Attention | null>(null)
  const close = useCallback(() => setAttention(null), [])
  return { show: setAttention, dialog: <AttentionDialog attention={attention} onClose={close} /> }
}
