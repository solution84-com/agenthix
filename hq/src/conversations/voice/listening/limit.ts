/**
 * The light model's own closing line at the "not yet" limit (adaptive voice listening, spec §When a turn ends): when a
 * turn kept open reaches the limit after an invitation nobody answered, hq asks once more, with the moment `limit`,
 * whose only wanted choice is `close_turn`. Anything else — another choice, no answer in time, a failure — gives no
 * line, and the caller plays a stored closing line instead. Words the person says meanwhile stop the call.
 */
import type { VoiceHumTone } from '@agenthix/core'
import type { ResolvedAccess, TurnUsage } from '../../contract'
import type { ListenerInput, ListenerMoment } from '../listener'
import { askListener } from './call'
import type { ListeningContext, ListeningDeps, ListeningSession } from './listen'
import type { ListeningState } from './state'

/** What one call reads: who is who, the recap and the last exchanges, this turn and its checks in this pause. */
export function listenerInputOf(ctx: ListeningContext, state: ListeningState, text: string, moment: ListenerMoment, now: number): ListenerInput {
  return {
    agent: ctx.agent, person: ctx.person, messageSoFar: text, moment, recap: ctx.recap, exchanges: ctx.exchanges,
    recentLines: state.recentLines, thisTurn: state.thisTurn.map(t => ({ tool: t.tool, words: t.words, atMs: now - t.at })),
    checks: { recent: [...state.checks], earlier: state.checksEarlier },
    ...(ctx.voiceHint && { voiceHint: ctx.voiceHint }),
  }
}

/** Its own closing line and the call's cost; null when it gave none; `stopped` when the person spoke meanwhile. */
export type ClosingLine = { say: string; tone?: VoiceHumTone; usage?: TurnUsage } | null | 'stopped'

export async function askClosingLine(
  deps: ListeningDeps, session: ListeningSession, state: ListeningState, text: string, access: ResolvedAccess, seq: number,
): Promise<ClosingLine> {
  const stop = new AbortController()
  state.limitCall = stop
  try {
    const ctx = await deps.context(session)
    if (stop.signal.aborted) return 'stopped'
    const input = listenerInputOf(ctx, state, text, { kind: 'limit', quietMs: deps.settings.notYetMaxSilenceMs }, deps.now())
    const run = () => askListener(deps.model, input, {
      access, settings: deps.settings, signal: stop.signal, timeoutMs: deps.settings.soundsFinishedTimeoutMs, cacheKey: session.conversationId,
    }, deps.now)
    const asked = await (deps.atLimit ? deps.atLimit({ session, seq, text }, run) : run())
    if ('superseded' in asked || stop.signal.aborted) return 'stopped'
    const decision = typeof asked.result === 'object' ? asked.result.decision : null
    deps.log(`listener ${session.conversationId} seq ${seq} limit: ${decision?.tool ?? asked.result} in ${asked.ms} ms`)
    if (decision?.tool !== 'close_turn') return null
    return { say: decision.say, ...(decision.tone && { tone: decision.tone }), ...(asked.usage ? { usage: asked.usage } : {}) }
  } finally {
    if (state.limitCall === stop) state.limitCall = null
  }
}
