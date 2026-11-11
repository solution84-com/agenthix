import { createContext, useContext, type ReactNode } from 'react'
import { Nudge } from './Nudge'

/**
 * True while the frame line says HQ is not answering: one cause, said once, so each screen's own "could not be read"
 * nudges are held back. The frame provides it; a screen never does.
 */
export const ReadNudgesHeld = createContext(false)

/**
 * A read that did not come back, with nothing on screen yet: render it in place of the content that could not be
 * shown, instead of the empty state or "Loading…" (never beside it). It goes by itself when the read next works and
 * the caller stops rendering it.
 *
 * - `retry`: HQ did not answer through the retries. It says what could not be read, and offers Try again.
 * - `final`: a final answer (not found, not allowed; see `isFinal`), in its own words, as "There is no such page here."
 *   Asking again cannot change it, so there is no Try again. This is the one case without `retry`.
 */
export function ReadFailure(props: { what: string; retry: () => void } | { what: string; final: string }): ReactNode {
  const held = useContext(ReadNudgesHeld)
  if ('final' in props) return <Nudge place="content" title={props.final} />
  if (held) return null
  return <Nudge place="content" title={`${props.what} could not be read`} action={{ label: 'Try again', onClick: props.retry }}>HQ did not answer.</Nudge>
}
