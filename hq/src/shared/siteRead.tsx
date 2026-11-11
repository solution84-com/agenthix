import { useContext, type ReactNode } from 'react'
import {
  Nudge, ReadFailure, ReadNudgesHeld, backgroundRetry, isFinal, useBackgroundRead, type BackgroundQuery, type BackgroundRead, type BackgroundReadOptions,
} from '@agenthix/ui/attention'
import { isSiteUnreachable } from './siteSilence'

/**
 * The quiet retry for a read HQ answers from an Execution Site: a site that did not answer is not retried by the page,
 * since HQ already waited for it (ui/DESIGN-SYSTEM.md, *Messages*); anything else follows the one policy.
 */
export function siteReadRetry(failures: number, error: unknown): boolean {
  return !isSiteUnreachable(error) && backgroundRetry(failures, error)
}

function wordsOf(error: unknown, otherwise: string): string {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : otherwise
}

const siteWords = (error: unknown) => wordsOf(error, "The site holding it isn't answering.")

/**
 * `useBackgroundRead` for a read held on an Execution Site. A site that did not answer is said at once, in its own
 * words: in place of the content when nothing is on screen yet (handler 7), else in the meta line over what is still
 * shown (handler 8). Any other failure follows `useBackgroundRead`.
 */
export function useSiteRead(query: BackgroundQuery, options: BackgroundReadOptions): BackgroundRead {
  const read = useBackgroundRead(query, options)
  if (!isSiteUnreachable(query.error)) return read
  const action = { label: 'Try again', onClick: () => { void query.refetch() } }
  if (query.data === undefined) {
    return {
      nudge: <Nudge place="content" title={`${options.what} could not be read`} action={action}>{siteWords(query.error)}</Nudge>,
      stale: false,
      failedWithoutData: true,
    }
  }
  return { nudge: <Nudge place="meta" action={action}>{siteWords(query.error)}</Nudge>, stale: false, failedWithoutData: false }
}

/**
 * Where a read's nudge goes: in place of the content when nothing is on screen (it brings its own spacing), or as a
 * meta line over what is still shown, padded as the screen's rows are.
 */
export function ReadNudge({ read, className = 'px-4 py-1' }: { read: BackgroundRead; className?: string }): ReactNode {
  if (!read.nudge) return null
  return read.failedWithoutData ? read.nudge : <div className={className}>{read.nudge}</div>
}

/**
 * In place of the content, for a read whose failure the caller holds already (after the quiet retries): a site that did
 * not answer in its own words, a final answer without Try again, anything else as `ReadFailure`.
 */
export function ReadFailed({ error, what, retry }: { error: unknown; what: string; retry: () => void }): ReactNode {
  if (isSiteUnreachable(error)) {
    return <Nudge place="content" title={`${what} could not be read`} action={{ label: 'Try again', onClick: retry }}>{siteWords(error)}</Nudge>
  }
  if (isFinal(error)) return <ReadFailure what={what} final={wordsOf(error, 'It is not there for you.')} />
  return <ReadFailure what={what} retry={retry} />
}

/**
 * The same in a slot of one line (a card on Home, a header line), where a nudge in place of the content would be too
 * tall: the line says what could not be read, with Try again, or a final answer in its own words. Held back, as every
 * read's nudge is, while the frame line says HQ is not answering.
 */
export function ReadFailedLine({ error, what, retry }: { error: unknown; what: string; retry: () => void }): ReactNode {
  const held = useContext(ReadNudgesHeld)
  if (isFinal(error)) return <Nudge place="meta">{wordsOf(error, 'It is not there for you.')}</Nudge>
  if (held) return null
  return <Nudge place="meta" action={{ label: 'Try again', onClick: retry }}>{`${what} could not be read.`}</Nudge>
}
