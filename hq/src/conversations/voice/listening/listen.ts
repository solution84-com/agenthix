/**
 * hq's listening call (adaptive voice listening, spec §The light model, §When a turn ends; plan tasks 3.2, 3.3, 3.11):
 * the browser says what just happened (`listen`), hq asks the light model with what it reads, and answers
 * (`listened`), speaking its words on a path of their own (`line`). A *sounds finished* call — or a re-check of a turn
 * it kept open — decides the turn: closed alone (a real, completed turn), handed over to the heavy model with its hold,
 * "not yet" (bounded), or the fallback when no usable answer came in time. One call is in flight per voice session: a
 * newer `seq` aborts the older. With the flag off, the person's Adaptive voice off or no light model reachable, the
 * answer says so (`off`), and a message the call carried is handed over without a word, as plain voice would.
 *
 * The listening style is the reply's to set (`set_listening_style`): `style` sends it as an answer of its own, carrying
 * the latest call's `seq`, which decides nothing else.
 *
 * Logs carry the choice and the timings, never the words of `answer`.
 */
import type { VoiceHumTone, VoiceListenedEvent, VoiceListenMoment, VoiceListenStyle } from '@agenthix/core'
import type { ModelAdapter, ResolvedAccess, TurnUsage } from '../../contract'
import type { ListenerDecision, ListenerInput, ListenerMoment, ListenerSettings } from '../listener'
import type { Asked } from './call'
import { askListener } from './call'
import { boundReached, settle } from './decide'
import { askClosingLine, listenerInputOf } from './limit'
import type { StoredPool } from '../phrases'
import { isLastQuietCheck, nextCheckSecs as scheduled } from './schedule'
import { listeningOf, type BoundHandOver, type ListeningState } from './state'

export interface ListenPayload {
  seq: number
  moment: VoiceListenMoment
  text: string
  quietMs: number
  workingMs?: number
  keptOpen?: boolean
}

/** The voice session as listening sees it. */
export interface ListeningSession { conversationId: string; holderId: string }

/** What the light model reads besides this turn: who is who, the recap and the last exchanges. */
export interface ListeningContext {
  agent: string
  person: string
  recap: string | null
  exchanges: ListenerInput['exchanges']
  /** How the person sounds, in hq's words: with Tone on only. */
  voiceHint?: string | null
}

export interface ListeningDeps {
  settings: ListenerSettings
  /** The flag `voiceListener` on, and the holder's Adaptive voice on. */
  enabled(holderId: string): Promise<boolean>
  /** The light model's access, costed under `listener`; null when no fast model is reached. */
  access(session: ListeningSession): Promise<ResolvedAccess | null>
  model: Pick<ModelAdapter, 'complete'>
  context(session: ListeningSession): Promise<ListeningContext>
  /** The person's message, admitted as a spoken message: the heavy model answers it. */
  admit(session: ListeningSession, text: string): Promise<void>
  /** A turn the light model closed alone, recorded as a completed turn; its id. */
  closeTurn(session: ListeningSession, turn: { message: string; agentText: string; access: ResolvedAccess; usage?: TurnUsage }): Promise<string>
  /** Speaks a light line on its own path (`line`), in the tone the light model gave it; its id at once. */
  speak(session: ListeningSession, text: string, tone?: VoiceHumTone): string
  /**
   * Plays a stored phrase none of the recent ones repeat — a hold phrase, or a closing line (`closing`); its id and
   * words, or null when none could be made.
   */
  speakStored(session: ListeningSession, avoid: readonly string[], pool?: StoredPool): Promise<{ lineId: string; text: string } | null>
  send(session: ListeningSession, event: VoiceListenedEvent): void
  now(): number
  /** Runs hq's own call at the "not yet" limit, answered as call `seq`: the playground records it as a call of its own. */
  atLimit?(call: { session: ListeningSession; seq: number; text: string }, run: () => Promise<Asked>): Promise<Asked>
  /** Runs `fn` after `ms`; the returned function cancels it. */
  later(ms: number, fn: () => void): () => void
  log(line: string): void
}

function momentOf(p: ListenPayload, settings: ListenerSettings): ListenerMoment {
  switch (p.moment) {
    case 'quietAfterWords': return { kind: 'quietAfterWords', quietMs: p.quietMs }
    case 'soundsFinished': return { kind: 'soundsFinished', quietMs: p.quietMs }
    case 'quiet': return {
      kind: 'quiet', quietMs: p.quietMs,
      ...(p.keptOpen ? { soundsFinished: true, ...(isLastQuietCheck(p.quietMs, settings) && { lastCheck: true }) } : {}),
    }
    case 'working': return { kind: 'working', workingMs: p.workingMs ?? p.quietMs }
  }
}

/** The tone a decision gave its line; none for calm. */
const lineTone = (d: ListenerDecision | null): VoiceHumTone | undefined => (d && 'tone' in d ? d.tone : undefined)

/** The least time a call is given, however long its reads took. */
const MIN_CALL_MS = 250

/** A timer per open turn, so "not yet" ends at its bound even if the browser asks no more. */
const boundTimers = new WeakMap<ListeningState, () => void>()

export function createListening(deps: ListeningDeps) {
  const { settings } = deps

  function answer(session: ListeningSession, seq: number, fields: Omit<VoiceListenedEvent, 'conversationId' | 'seq' | 'nextCheckSecs'> & { nextCheckSecs?: number }): void {
    // A hand over starts the wait for the reply: its first check is the working one.
    const handed = fields.turn === 'handedOver' || fields.turn === 'fallback'
    const nextCheckSecs = handed ? scheduled({ kind: 'working', workingMs: 0 }, settings) : settings.schedule.quietFirst
    deps.send(session, { conversationId: session.conversationId, seq, nextCheckSecs, ...fields })
  }

  function clearOpen(state: ListeningState): void {
    state.openTurn = null
    boundTimers.get(state)?.()
    boundTimers.delete(state)
  }

  /** The message goes to the heavy model: a hold line of its own was said, or a stored one plays now. */
  async function handOver(session: ListeningSession, state: ListeningState, text: string, stored: boolean): Promise<{ lineId?: string; say?: string }> {
    clearOpen(state)
    state.awaitingReply = true
    // The wait for the answer counts its own checks.
    state.clearChecks()
    const line = stored ? await deps.speakStored(session, state.recentStored) : null
    if (line) {
      state.playedStored(line.text)
      state.sent(line.lineId, line.text)
    }
    await deps.admit(session, text)
    return line ? { lineId: line.lineId, say: line.text } : {}
  }

  /**
   * The "not yet" limit is reached. After an invitation nobody answered (a presence check included), the turn is
   * closed, a real turn with no heavy model call: with the light model's own closing line, asked for once more, or a
   * stored one when it gives none. Otherwise, or when no closing line can be had, the message goes to the heavy model
   * with a stored hold phrase. Null when the person spoke while the closing line was asked for: their words go on.
   */
  async function atBound(session: ListeningSession, state: ListeningState, text: string, access: ResolvedAccess, seq: number): Promise<BoundHandOver | null> {
    clearOpen(state)
    if (!state.invited) return { action: 'keep_listening', turn: 'fallback', ...(await handOver(session, state, text, true)) }
    const own = await askClosingLine(deps, session, state, text, access, seq)
    if (own === 'stopped') return null
    let line: { lineId: string; text: string } | null = null
    if (own) {
      line = { lineId: deps.speak(session, own.say, own.tone), text: own.say }
    } else {
      line = await deps.speakStored(session, state.recentStored, 'closing')
      if (line) state.playedStored(line.text)
      else deps.log(`listener ${session.conversationId}: no closing line could be had, handed over`)
    }
    if (!line) return { action: 'keep_listening', turn: 'fallback', ...(await handOver(session, state, text, true)) }
    state.did('close_turn', line.text, deps.now())
    const heard = state.takeHeard()
    const agentText = [...heard.map(l => l.text), line.text].join(' ')
    const usage = own?.usage
    const turnId = await deps.closeTurn(session, { message: text, agentText, access, ...(usage ? { usage } : {}) })
    state.turnOver = true
    state.clearChecks()
    state.heardIn(turnId, 'whole', [...heard, { lineId: line.lineId, text: line.text, played: false }])
    return { action: 'close_turn', turn: 'closed', turnId, lineId: line.lineId, say: line.text }
  }

  const boundLog = (end: BoundHandOver) => (end.turn === 'closed' ? 'closed after an unanswered invitation' : 'handed over')

  /** The turn stays open, bounded; `quietMs`: the quiet it has already had, which the bound counts. */
  function keepOpen(session: ListeningSession, state: ListeningState, text: string, access: ResolvedAccess, quietMs = 0): void {
    if (state.openTurn) {
      state.openTurn.text = text
      return
    }
    const open = { text, since: deps.now() - quietMs }
    state.openTurn = open
    boundTimers.set(state, deps.later(Math.max(0, settings.notYetMaxSilenceMs - quietMs), () => {
      if (state.openTurn !== open) return
      // The browser is told as by the re-check's bound, on its latest call, so it never sends these words again.
      void atBound(session, state, open.text, access, state.latestSeq).then(end => {
        if (!end) return deps.log(`listener ${session.conversationId}: they spoke at the limit; the turn goes on`)
        deps.log(`listener ${session.conversationId}: kept open ${settings.notYetMaxSilenceMs} ms, ${boundLog(end)}`)
        if (!state.openTurn) state.boundHandOver = end
        answer(session, state.latestSeq, end)
      }).catch(err => deps.log(`listener ${session.conversationId}: the bound's end failed: ${String(err)}`))
    }))
  }

  async function listen(session: ListeningSession, p: ListenPayload): Promise<void> {
    const arrived = deps.now()
    const state = listeningOf(session)
    const signal = state.begin(p.seq)
    if (!signal) return
    const recheck = p.moment === 'quiet' && p.keptOpen === true
    // They spoke again in a turn kept open, and its re-check carries their words: its quiet, and the bound, start again.
    const resumed = recheck && state.openTurn !== null && p.text.trim() !== '' && p.text.trim() !== state.openTurn.text
    // Kept for a re-check before a new turn starts: the bound's timer may have closed the turn this re-check asks about.
    const bound = recheck && !state.openTurn ? state.boundHandOver : null
    if (p.moment !== 'working' && state.turnOver) state.newTurn()
    // They spoke again: a turn kept open goes on with their words, and the next sounds finished call carries them all.
    if (p.moment === 'quietAfterWords' || p.moment === 'soundsFinished') {
      state.limitCall?.abort()
      clearOpen(state)
      state.boundHandOver = null
    } else if (resumed) state.limitCall?.abort()
    // A re-check sent before the bound's answer reached the browser, which takes that answer as stale: it is told again.
    if (bound) {
      state.boundHandOver = null
      return answer(session, p.seq, bound)
    }
    const decides = p.moment === 'soundsFinished' || (recheck && state.openTurn !== null)
    let open = recheck ? state.openTurn : null
    // The bound's timer handed the turn this re-check decides over while it ran: the timer answered for it.
    const takenByBound = () => open !== null && state.openTurn !== open
    const text = p.text.trim() || (decides ? state.openTurn?.text ?? '' : '')
    state.wordsAre(text)

    const access = (await deps.enabled(session.holderId)) ? await deps.access(session) : null
    if (takenByBound()) return
    if (!access) {
      state.active = false
      if (decides && text) {
        await handOver(session, state, text, false)
        return answer(session, p.seq, { action: 'keep_listening', off: true, turn: 'handedOver' })
      }
      return answer(session, p.seq, { action: 'keep_listening', off: true })
    }
    state.active = true
    if (decides && !text) return answer(session, p.seq, { action: 'keep_listening' })
    if (resumed) {
      clearOpen(state)
      keepOpen(session, state, text, access, p.quietMs)
      open = state.openTurn
    }

    if (decides && p.moment === 'quiet' && state.openTurn && boundReached(p.quietMs, state.openTurn.since, deps.now(), settings.notYetMaxSilenceMs)) {
      const end = await atBound(session, state, text, access, p.seq)
      if (!end) return
      deps.log(`listener ${session.conversationId} seq ${p.seq}: kept open to the bound, ${boundLog(end)}`)
      return answer(session, p.seq, end)
    }

    const ctx = await deps.context(session)
    if (!state.isLatest(p.seq) || takenByBound()) return
    const now = deps.now()
    const moment = momentOf(p, settings)
    const input = listenerInputOf(ctx, state, text, moment, now)
    // The time limit counts from the call's arrival: what was read for it is inside it, not added to it.
    const limit = decides ? settings.soundsFinishedTimeoutMs : settings.callTimeoutMs
    const timeoutMs = Math.max(MIN_CALL_MS, limit - (deps.now() - arrived))
    const asked = await askListener(deps.model, input, { access, settings, signal, timeoutMs, cacheKey: session.conversationId }, deps.now)
    if ('superseded' in asked) return deps.log(`listener ${session.conversationId} seq ${p.seq} ${p.moment}: superseded after ${asked.ms} ms`)
    if (takenByBound()) return deps.log(`listener ${session.conversationId} seq ${p.seq}: the bound handed the turn over first`)

    const stale = !state.isLatest(p.seq)
    const out = settle({ soundsFinished: decides, result: asked.result, stale })
    const decision = typeof asked.result === 'object' ? asked.result.decision : null
    const dropped = decision?.tool === 'keep_listening' && decision.dropped ? ` (dropped: ${decision.dropped.reason})` : ''
    deps.log(`listener ${session.conversationId} seq ${p.seq} ${p.moment}: ${decision?.tool ?? asked.result}${dropped}${out.turn ? `, turn ${out.turn}` : ''}${stale ? ', stale' : ''} in ${asked.ms} ms`)
    if (!out.send) return
    if (decision && !stale) state.checked({ kind: moment.kind, ms: moment.kind === 'working' ? moment.workingMs : moment.quietMs ?? 0, tool: decision.tool })
    // hq's schedule, counted from now: the browser waits from the answer's arrival.
    const elapsed = deps.now() - arrived
    const nextCheckSecs = out.turn === 'handedOver' || out.turn === 'fallback'
      ? scheduled({ kind: 'working', workingMs: 0 }, settings)
      : moment.kind === 'working'
        ? scheduled({ kind: 'working', workingMs: moment.workingMs + elapsed }, settings)
        : scheduled({ kind: 'quiet', quietMs: (moment.kind === 'limit' ? 0 : moment.quietMs ?? 0) + elapsed }, settings)
    const action = decision?.tool ?? 'keep_listening'

    if (out.turn === 'fallback') {
      return answer(session, p.seq, { action, nextCheckSecs, turn: 'fallback', ...(await handOver(session, state, text, true)) })
    }
    if (out.turn === 'closed' && decision && out.say) {
      clearOpen(state)
      state.did(decision.tool, out.say, now)
      const heard = state.takeHeard()
      const agentText = [...heard.map(l => l.text), out.say].join(' ')
      const turnId = await deps.closeTurn(session, { message: text, agentText, access, ...(asked.usage ? { usage: asked.usage } : {}) })
      state.turnOver = true
      // Already in the agent message: the line closing the turn is not kept for the next.
      const lineId = deps.speak(session, out.say, lineTone(decision))
      state.heardIn(turnId, 'whole', [...heard, { lineId, text: out.say, played: false }])
      return answer(session, p.seq, { action, nextCheckSecs, say: out.say, lineId, turn: 'closed', turnId })
    }
    const say = out.say
    if (decision && say) state.did(decision.tool, say, now)
    const lineId = say ? deps.speak(session, say, lineTone(decision)) : undefined
    if (lineId && say) state.sent(lineId, say)
    if (out.turn === 'handedOver') {
      await handOver(session, state, text, false)
      return answer(session, p.seq, { action, nextCheckSecs, ...(say ? { say, lineId } : {}), turn: 'handedOver' })
    }
    if (out.keepOpen) keepOpen(session, state, text, access)
    answer(session, p.seq, { action, nextCheckSecs, ...(say ? { say, lineId } : {}) })
  }

  return {
    listen,
    /** A line played to its end in the browser. */
    played(session: ListeningSession, lineId: string): void {
      listeningOf(session).played(lineId)
    },
    /** The reply set a listening style: the holder's page keeps it for the conversation. */
    style(session: ListeningSession, style: VoiceListenStyle): void {
      const latest = listeningOf(session).latestSeq
      deps.log(`listener ${session.conversationId}: the reply set the listening style ${style}`)
      answer(session, Number.isFinite(latest) ? latest : 0, { action: 'keep_listening', style })
    },
  }
}
