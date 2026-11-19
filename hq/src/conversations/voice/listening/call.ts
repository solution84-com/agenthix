/**
 * One listening call (adaptive voice listening, spec §The light model): the call built by the listener module from what
 * it reads, sent to the light model under a time limit, and its answer parsed by the module's rules. The call is
 * stopped when a newer one supersedes it (`signal`) or when its time runs out; its cost is written by the model
 * adapter under `listener`, on the access the resolver gave.
 */
import type { ModelAdapter, ResolvedAccess, TurnUsage } from '../../contract'
import {
  buildListenerCall, parseListenerResponse,
  type ListenerDecision, type ListenerInput, type ListenerSettings,
} from '../listener'
import type { ListenResult } from './decide'

/** The longest answer: one JSON object, a hold of 12 words and an `answer` beside it. */
const MAX_OUTPUT_TOKENS = 300

export interface AskOptions {
  access: ResolvedAccess
  settings: ListenerSettings
  /** The newer call's abort. */
  signal: AbortSignal
  timeoutMs: number
  cacheKey: string
}

/** What a call came to, and how long it took; `superseded` when a newer call stopped it. */
export type Asked = { result: ListenResult; ms: number; usage?: TurnUsage } | { superseded: true; ms: number }

export async function askListener(
  model: Pick<ModelAdapter, 'complete'>, input: ListenerInput, options: AskOptions, now: () => number = Date.now,
): Promise<Asked> {
  const started = now()
  // One JSON object: the format phase 1 measured and took. A one-step call carries no tool calls back.
  const call = buildListenerCall(input, { mode: 'json', settings: options.settings })
  const timedOut = new AbortController()
  const timer = setTimeout(() => timedOut.abort(), options.timeoutMs)
  timer.unref?.()
  const signal = AbortSignal.any([options.signal, timedOut.signal])
  try {
    const { text, usage } = await model.complete({
      access: options.access,
      system: [{ text: call.system, cacheAfter: true }],
      messages: [{ role: 'user', content: call.user }],
      cacheKey: options.cacheKey,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Reasoning off where the provider can turn it off: the answer is wanted at once.
      spoken: true,
      signal,
    })
    // An answer that came although a newer call stopped this one is still read: an acknowledgement plays.
    if (timedOut.signal.aborted && !options.signal.aborted) return { result: 'timeout', ms: now() - started }
    const decision: ListenerDecision = parseListenerResponse(
      { text, calls: [] }, { mode: call.mode, soundsFinished: call.soundsFinished, settings: options.settings },
    )
    return { result: { decision }, ms: now() - started, usage }
  } catch {
    if (options.signal.aborted) return { superseded: true, ms: now() - started }
    return { result: timedOut.signal.aborted ? 'timeout' : 'failed', ms: now() - started }
  } finally {
    clearTimeout(timer)
  }
}
