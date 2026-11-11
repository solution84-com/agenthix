import { createContext, useContext, useEffect } from 'react'
import { Loader2, Square, Volume2 } from 'lucide-react'
import { BUTTON_GHOST, Tooltip } from '@agenthix/ui/primitives'
import { listenTo, listeningTo, stopListening, useListenState } from './listenPlayer'
import { ThreadFailure } from './ThreadFailure'

/** Where answers can be read aloud: the conversation, when text to speech works for its agent. Absent: nowhere. */
export const ListenContext = createContext<{ conversationId: string } | null>(null)

export const ANSWER_ICON = `inline-flex h-8 w-8 items-center justify-center rounded-lg ${BUTTON_GHOST} max-lg:h-11 max-lg:w-11`

/**
 * The speaker under an answer: reads it aloud in the agent's voice, and stops it when pressed again. Not there where
 * voice is not available, and stops when its answer leaves the screen. A failure is a line in the thread, with Try
 * again, gone once it reads aloud.
 */
export function ListenButton({ messageId }: { messageId: string }) {
  const where = useContext(ListenContext)
  const state = useListenState()
  // Leaving the conversation stops its answer being read.
  useEffect(() => () => { if (listeningTo() === messageId) stopListening() }, [messageId])
  if (!where) return null
  const mine = state?.messageId === messageId ? state : null
  const busy = mine?.phase === 'loading' || mine?.phase === 'playing'
  const label = busy ? 'Stop reading aloud' : 'Read aloud'
  const listen = () => void listenTo({ conversationId: where.conversationId, messageId })
  return (
    <>
    <ThreadFailure text={mine?.phase === 'failed' ? mine.reason : null} title="The answer was not read aloud" retry={listen} />
    <Tooltip label={label} side="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={busy}
        data-testid="listen-button"
        onClick={() => (busy ? stopListening() : listen())}
        className={`${ANSWER_ICON} ${busy ? 'bg-selected text-text-primary' : ''}`}
      >
        {mine?.phase === 'loading' ? <Loader2 size={16} aria-hidden className="motion-safe:animate-spin" />
          : mine?.phase === 'playing' ? <Square size={14} aria-hidden />
          : <Volume2 size={16} aria-hidden />}
      </button>
    </Tooltip>
    </>
  )
}
