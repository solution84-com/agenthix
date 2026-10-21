/**
 * One attempt at a speech connection for the inbound loop (`sender`): a token, the service's `connect`, a time
 * limit on it, and the stream clock that places its words. Whatever it hears or suffers reaches the sender only
 * while it is still the sender's current connection; one that opens after it was given up is closed at once.
 */
import type { Clock } from '../clock'
import type { ServiceWord, SpeechToText, SpeechToTextConnection } from '../ports'
import { createStreamClock, type StreamClock } from '../streamClock'

export type Link = {
  id: number
  conn: SpeechToTextConnection | null
  clock: StreamClock
  /** The furthest point of its stream a word has been heard from. */
  heardTo: number
  gotWords: boolean
  openedAt: number
}

export type LinkEvents = {
  words: (link: Link, text: string, service: ServiceWord[], committed: boolean, turn: number | null) => void
  opened: (link: Link, conn: SpeechToTextConnection) => void
  /** The service closed it, or reported an error on it, without being asked. */
  lost: (link: Link, why: string) => void
  /** It could not be opened. */
  failed: (link: Link, why: string) => void
}

export type LinkDeps = {
  clock: Clock
  token: () => Promise<SpeechToText>
  timeoutMs: number
  /** The sender's connection now: a link that is no longer it is ignored. */
  current: () => Link | null
}

export function connectLink(id: number, deps: LinkDeps, on: LinkEvents): Link {
  const mine: Link = { id, conn: null, clock: createStreamClock(), heardTo: -Infinity, gotWords: false, openedAt: deps.clock.now() }
  const live = () => deps.current() === mine
  const failed = (why: string) => { if (live()) on.failed(mine, why) }
  const timeout = deps.clock.after(deps.timeoutMs, () => { if (!mine.conn) failed('the speech service did not answer') })
  deps.token()
    .then(service => service.connect({
      onWords(text, words, committed, turn) { if (live()) on.words(mine, text, words, committed, turn) },
      onClose: reason => { if (live()) on.lost(mine, reason) },
      onError: message => { if (live()) on.lost(mine, message) },
    }))
    .then((conn) => {
      timeout.cancel()
      if (!live()) { conn.close(); return }
      mine.conn = conn
      on.opened(mine, conn)
    }, (err: unknown) => {
      timeout.cancel()
      failed(err instanceof Error ? err.message : 'the speech service could not be reached')
    })
  return mine
}
