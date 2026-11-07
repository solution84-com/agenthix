import { createContext, useContext, useEffect } from 'react'
import { Loader2, Square, Volume2 } from 'lucide-react'
import { Tooltip } from '@agenthix/ui/primitives'
import { listenTo, listeningTo, stopListening, useListenState } from './listenPlayer'

/** Where answers can be read aloud: the conversation, when text to speech works for its agent. Absent: nowhere. */
export const ListenContext = createContext<{ conversationId: string } | null>(null)

export const ANSWER_ICON = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary max-lg:h-11 max-lg:w-11'

/**
 * The speaker under an answer: reads it aloud in the agent's voice, and stops it when pressed again. Not there where
 * voice is not available, and stops when its answer leaves the screen. A failure is said in its name, never as a
 * line in the thread.
 */
export function ListenButton({ messageId }: { messageId: string }) {
  const where = useContext(ListenContext)
  const state = useListenState()
  // Leaving the conversation stops its answer being read.
  useEffect(() => () => { if (listeningTo() === messageId) stopListening() }, [messageId])
  if (!where) return null
  const mine = state?.messageId === messageId ? state : null
  const busy = mine?.phase === 'loading' || mine?.phase === 'playing'
  const label = mine?.phase === 'failed' ? `${mine.reason} Listen again` : busy ? 'Stop reading aloud' : 'Read aloud'
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={busy}
        data-testid="listen-button"
        onClick={() => (busy ? stopListening() : void listenTo({ conversationId: where.conversationId, messageId }))}
        className={`${ANSWER_ICON} ${busy ? 'bg-selected text-text-primary' : ''}`}
      >
        {mine?.phase === 'loading' ? <Loader2 size={16} aria-hidden className="motion-safe:animate-spin" />
          : mine?.phase === 'playing' ? <Square size={14} aria-hidden />
          : <Volume2 size={16} aria-hidden className={mine?.phase === 'failed' ? 'text-warning' : ''} />}
      </button>
    </Tooltip>
  )
}
