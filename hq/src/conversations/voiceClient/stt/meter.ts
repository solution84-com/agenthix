/**
 * What a speech connection streamed, handed back to hq when it closes (`reportSpeechSession`), so the session is on
 * the ledger: the browser streams to the speech service itself, and hq cannot see it. A connection counts the audio
 * it was sent; a token that opened no connection, or a connection that streamed nothing, reports nothing. A page
 * closed before the connection is lost, and hq does not recover it.
 */
import type { SpeechToText, SpeechToTextConnection, SpeechToTextHandlers } from '../ports'
import { SPEECH_RATE } from '../resample'

export type SpeechReport = (session: { ticket: string; audioMs: number }) => void

export function meterConnection(ticket: string | undefined, report: SpeechReport | undefined) {
  let samples = 0
  let done = false
  const finish = () => {
    if (done) return
    done = true
    if (ticket && report && samples > 0) report({ ticket, audioMs: Math.round(samples / (SPEECH_RATE / 1000)) })
  }
  return {
    /** The handlers, told as well when the service closes the connection. */
    handlers: (h: SpeechToTextHandlers): SpeechToTextHandlers => ({ ...h, onClose: (reason) => { finish(); h.onClose(reason) } }),
    /** The connection, counting what is sent and reporting once when it is closed. */
    connection: (c: SpeechToTextConnection): SpeechToTextConnection => ({
      ...c,
      send: (pcm) => { samples += pcm.length; c.send(pcm) },
      close: () => { finish(); c.close() },
    }),
  }
}

/** A speech service on a token, reporting each connection it makes under that token's ticket; `settings` passed through. */
export function meteredService<T extends { ticket?: string }, S = undefined>(
  service: (token: T, settings: S) => SpeechToText, report: SpeechReport | undefined,
): (token: T, settings?: S) => SpeechToText {
  // A service that takes no settings is called with none.
  const call = (token: T, settings?: S) => service(token, settings as S)
  if (!report) return call
  return (token, settings) => {
    const meter = meterConnection(token.ticket, report)
    const inner = call(token, settings)
    return { connect: (handlers) => inner.connect(meter.handlers(handlers)).then(meter.connection) }
  }
}
