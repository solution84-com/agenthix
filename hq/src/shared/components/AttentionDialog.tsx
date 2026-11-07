import { useCallback, useState, type ReactNode } from 'react'
import { Button, Modal } from '@agenthix/ui/primitives'

/** What needs the person's attention: a failure or a refusal, in words, and what to do again when there is a way. */
export type Attention = { title?: string; text: string; retry?: () => void }

const DEFAULT_TITLE = 'That did not work'

/**
 * The one way a screen asks for the person's attention (a message is never part of the content's layout): a dialog
 * in the centre of the screen with a title, the words, Close, and Try again where the caller gives a way to retry.
 * A result the screen already shows gets no message; a refusal known in advance is said by the control instead.
 */
export function AttentionDialog({ attention, onClose }: { attention: Attention | null; onClose: () => void }) {
  if (!attention) return null
  const { retry } = attention
  return (
    <Modal open onClose={onClose} title={attention.title ?? DEFAULT_TITLE}>
      <p role="alert" data-testid="attention-text" className="break-words text-body text-text-primary">{attention.text}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {retry && <Button onClick={() => { onClose(); retry() }}>Try again</Button>}
      </div>
    </Modal>
  )
}

/** `show(...)` opens the dialog; render `dialog` once, anywhere outside a menu that closes on a click away. */
export function useAttention(): { show: (attention: Attention) => void; dialog: ReactNode } {
  const [attention, setAttention] = useState<Attention | null>(null)
  const close = useCallback(() => setAttention(null), [])
  return { show: setAttention, dialog: <AttentionDialog attention={attention} onClose={close} /> }
}
