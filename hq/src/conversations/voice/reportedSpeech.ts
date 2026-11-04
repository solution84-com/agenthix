import { reportCall } from '../../routing/resolver'
import { failureKind } from '../../voice/speechAccess'
import type { WordTiming } from '../../voice/ttsAdapter'

/**
 * Speech from the provider, its outcome reported to the provider's health as it ends. `answered` is told once, at the
 * first audio: the service took the text, so its characters count even if the speech is then stopped.
 */
export async function* reported(providerId: string, speech: AsyncIterable<{ audio: Buffer; wordTiming?: WordTiming }>, answered?: () => void) {
  let first = true
  try {
    for await (const piece of speech) {
      if (first) { first = false; answered?.() }
      yield piece
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reportCall(providerId, failureKind(null, message), message.slice(0, 200))
    throw err
  }
  reportCall(providerId, null)
}
