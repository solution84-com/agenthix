import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ListTree, MoreHorizontal, RotateCcw } from 'lucide-react'
import { useQuery, getAnswerFacts } from 'wasp/client/operations'
import { BUTTON_GHOST, MENU_ITEM, Tooltip } from '@agenthix/ui/primitives'
import { copyText } from '../../shared/copyText'
import { ANSWER_ICON, ListenButton } from './ListenButton'
import { seconds } from './ThinkingPill'
import { SaveToTaskButton, type SaveToTask } from './SaveToTask'

const ITEM = MENU_ITEM

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  useEffect(() => {
    if (copied === null) return
    const timer = setTimeout(() => setCopied(null), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const label = copied ? 'Copied' : copied === false ? 'Could not copy' : 'Copy'
  return (
    <Tooltip label={label} side="top">
      <button type="button" aria-label={label} onClick={() => void copyText(text).then(setCopied)} className={ANSWER_ICON}>
        {copied ? <Check size={16} aria-hidden className="text-success" /> : <Copy size={16} aria-hidden />}
      </button>
    </Tooltip>
  )
}

/** What the answer used, as its turn's record keeps it: fetched when the menu opens, once (a missing record is no error). */
function AnswerFacts({ conversationId, turnId }: { conversationId: string; turnId: string }) {
  const { data, error, isLoading } = useQuery(getAnswerFacts, { conversationId, turnId }, { retry: false })
  const facts = data
    ? [data.model, data.ms !== null && seconds(data.ms), `${data.tokensRead.toLocaleString('en-GB')} tokens read`, `${data.tokensWritten.toLocaleString('en-GB')} written`].filter(Boolean).join(' · ')
    : null
  const line = isLoading ? 'Looking it up…' : error ? 'Could not look it up just now.' : facts ?? 'Not recorded for this answer.'
  return (
    <div className="px-3 py-2" data-testid="answer-facts">
      <p className="text-small text-text-primary">What this answer used</p>
      <p className="text-micro text-text-muted">{line}</p>
    </div>
  )
}

function AnswerMenu({ conversationId, turnId, onShowRun }: { conversationId?: string; turnId?: string | null; onShowRun?: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const facts = conversationId && turnId
  if (!onShowRun && !facts) return null
  return (
    <div ref={ref} className="relative">
      <Tooltip label="More about this answer" side="top" disabled={open}>
        <button
          type="button"
          aria-label="More about this answer"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`${ANSWER_ICON} ${open ? 'bg-selected text-text-primary' : ''}`}
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </Tooltip>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-1 shadow-pop">
          {onShowRun && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onShowRun() }} className={ITEM}>
              <ListTree size={14} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
              <span className="min-w-0">
                <span className="block text-small text-text-primary">Show the run</span>
                <span className="block text-micro text-text-muted">Every step it took, in order</span>
              </span>
            </button>
          )}
          {facts && <AnswerFacts conversationId={conversationId} turnId={turnId} />}
        </div>
      )}
    </div>
  )
}

/**
 * Under the agent's answer once its turn has ended, never while it streams: Copy and the speaker as icons (each
 * named on hover and for a screen reader), *Try again* on an answer that was stopped, and ⋯ with *Show the run*
 * and what the answer used. Each a 32 px target, 44 px on a phone, with space between.
 */
export function ReplyActions({ text, messageId, conversationId, turnId, onShowRun, onTryAgain, onSaveToTask }: {
  /** What Copy copies; empty for a stopped answer that said nothing, which offers only Try again. */
  text: string
  /** The answer's message, which the speaker reads. */
  messageId?: string
  conversationId?: string
  turnId?: string | null
  /** Opens the turn's steps; absent when it took none. */
  onShowRun?: () => void
  /** Sends the person's message again; on an answer that was stopped. */
  onTryAgain?: () => void
  /** In a task's conversation: *Save to the task*. */
  onSaveToTask?: SaveToTask
}) {
  return (
    <div className="flex items-center gap-2 text-text-muted" data-testid="reply-actions">
      {text && <CopyButton text={text} />}
      {text && messageId && <ListenButton messageId={messageId} />}
      {text && onSaveToTask && <SaveToTaskButton text={text} onSave={onSaveToTask} />}
      {onTryAgain && (
        <button
          type="button"
          onClick={onTryAgain}
          className={`inline-flex h-8 items-center gap-1.5 px-2 text-small font-medium rounded-lg ${BUTTON_GHOST} max-lg:h-11`}
        >
          <RotateCcw size={14} aria-hidden />
          Try again
        </button>
      )}
      {text && <AnswerMenu conversationId={conversationId} turnId={turnId} onShowRun={onShowRun} />}
    </div>
  )
}
