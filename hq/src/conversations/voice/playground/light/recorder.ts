/**
 * hq's own listening call (`createListening`) with every call told to the playground's page (plan task 5.3): the
 * moment, the message so far, the choice and its words, `answer`, `asked`, hq's next check, how long it took and whether
 * it was stale, superseded or over its time limit; how each turn ended; and each line played. The call's deps are
 * wrapped, not changed: what runs is what hq runs. Each call is followed through its own async context, since a newer
 * call may begin while an older one waits on the model.
 *
 * `answer` and `why` go only to the page's rows; hq's log lines (`deps.log`) never carry it.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { VoiceListenedEvent } from '@agenthix/core'
import type { TurnUsage } from '../../../contract'
import type { LightCallRow, LightLineRow, LightTurnRow } from '../../../../shared/voicePlaygroundLight'
import { parseListenerResponse, type ListenerDecision } from '../../listener'
import { createListening, type ListenPayload, type ListeningDeps, type ListeningSession } from '../../listening/listen'

export interface RecorderOut {
  call(row: LightCallRow): void
  turn(row: LightTurnRow): void
  line(row: LightLineRow): void
}

interface CallRecord {
  payload: ListenPayload
  /** hq's own call at the "not yet" limit. */
  limit?: boolean
  started: number | null
  ended: number | null
  raw: string | null
  usage: TurnUsage | null
  threw: boolean
  sent: VoiceListenedEvent | null
}

/** A call that may end the turn: *sounds finished*, or a re-check of a turn kept open. */
export function decidesTurn(p: Pick<ListenPayload, 'moment' | 'keptOpen'>): boolean {
  return p.moment === 'soundsFinished' || (p.moment === 'quiet' && p.keptOpen === true)
}

function wordsOf(d: ListenerDecision | null): string | null {
  if (!d || d.tool === 'keep_listening') return null
  return d.tool === 'hand_over' ? d.hold : d.say
}

/** The words a dropped answer carried (`say`, `hold` or `words`), read from the model's own text. */
function droppedWordsOf(raw: string | null): string | null {
  if (!raw) return null
  const body = (raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? raw).trim()
  try {
    const o = JSON.parse(body) as Record<string, unknown>
    const w = [o.say, o.hold, o.words].find((v): v is string => typeof v === 'string' && v.trim() !== '')
    return w?.trim() ?? null
  } catch { return null }
}

export function recordedListening(deps: ListeningDeps, out: RecorderOut, newId: () => string) {
  const calls = new AsyncLocalStorage<CallRecord>()
  const latest = new WeakMap<object, number>()
  const lines = new Map<string, { text: string; stored: boolean }>()
  const { settings } = deps

  const wrapped: ListeningDeps = {
    ...deps,
    model: {
      async complete(request) {
        const rec = calls.getStore()
        if (rec) rec.started = deps.now()
        try {
          const answer = await deps.model.complete(request)
          if (rec) Object.assign(rec, { ended: deps.now(), raw: answer.text, usage: answer.usage })
          return answer
        } catch (err) {
          if (rec) Object.assign(rec, { ended: deps.now(), threw: true })
          throw err
        }
      },
    },
    send(session, event) {
      const rec = calls.getStore()
      if (rec && event.seq === rec.payload.seq) rec.sent = event
      // Outside any call: the "not yet" bound's own timer ended the turn, handed over or closed.
      if (!rec && event.turn) {
        const outcome = outcomeOf(event)
        out.turn({ id: newId(), seq: outcome === 'closed' ? event.seq : null, outcome, say: event.say ?? null, at: deps.now() })
      }
      deps.send(session, event)
    },
    speak(session, text, tone) {
      const lineId = deps.speak(session, text, tone)
      lines.set(lineId, { text, stored: false })
      return lineId
    },
    async speakStored(session, avoid, pool) {
      const line = await deps.speakStored(session, avoid, pool)
      if (line) lines.set(line.lineId, { text: line.text, stored: true })
      return line
    },
    // hq's own call at the limit is told as a call of its own, on the call it answers.
    async atLimit(call, run) {
      const rec: CallRecord = {
        payload: { seq: call.seq, moment: 'quiet', keptOpen: true, text: call.text, quietMs: settings.notYetMaxSilenceMs },
        limit: true, started: null, ended: null, raw: null, usage: null, threw: false, sent: null,
      }
      const asked = await calls.run(rec, () => (deps.atLimit ? deps.atLimit(call, run) : run()))
      report(call.session, rec)
      return asked
    },
    // A timer runs outside the call that set it, so what it does is not taken for that call's.
    later: (ms, fn) => deps.later(ms, () => calls.exit(fn)),
  }
  /** A turn closed with one of hq's stored closing lines is SYSTEM's, not the light model's. */
  const outcomeOf = (e: VoiceListenedEvent): LightTurnRow['outcome'] =>
    e.turn === 'closed' && e.lineId && lines.get(e.lineId)?.stored ? 'limitClosed' : e.turn!

  const listening = createListening(wrapped)

  function report(session: object, rec: CallRecord): void {
    const p = rec.payload
    const decides = decidesTurn(p)
    const sent = rec.sent
    const at = deps.now()
    if (rec.started !== null) {
      const ms = (rec.ended ?? at) - rec.started
      const limit = decides ? settings.soundsFinishedTimeoutMs : settings.callTimeoutMs
      const newer = (latest.get(session) ?? p.seq) > p.seq
      const decision = rec.raw === null ? null
        : parseListenerResponse({ text: rec.raw, calls: [] }, { mode: 'json', soundsFinished: decides, settings })
      const superseded = rec.threw && newer && sent === null
      const overLimit = !superseded && (rec.threw ? ms >= limit - 50 : ms > limit)
      out.call({
        id: newId(), seq: p.seq, moment: rec.limit ? 'limit' : p.moment, keptOpen: p.keptOpen === true, quietMs: p.quietMs, workingMs: p.workingMs ?? null,
        message: p.text, choice: decision?.tool ?? null, words: wordsOf(decision),
        answer: decision?.tool === 'hand_over' ? decision.answer : null, answerCut: decision?.tool === 'hand_over' && decision.answerCut === true, why: decision?.why ?? null, withReason: settings.withReason, asked: decision?.tool === 'hand_over' ? decision.asked : null,
        nextCheck: decision && sent ? sent.nextCheckSecs : null, dropped: decision?.tool === 'keep_listening' ? decision.dropped?.reason ?? null : null,
        droppedWords: decision?.tool === 'keep_listening' && decision.dropped?.reason === 'over the word cap' ? droppedWordsOf(rec.raw) : null,
        ...(decision && 'tone' in decision && decision.tone && { tone: decision.tone }),
        ms, stale: newer && !superseded, overLimit, superseded, failed: rec.threw && !superseded && !overLimit,
        inputTokens: rec.usage?.inputTokens ?? 0, outputTokens: rec.usage?.outputTokens ?? 0, at,
      })
    }
    if (!sent) return
    // Off: a message the call carried went to the heavy model with nothing said, as plain voice.
    const outcome = sent.off ? (sent.turn ? 'off' : null) : sent.turn ? outcomeOf(sent) : decides && rec.started !== null ? 'notYet' : null
    if (outcome) out.turn({ id: newId(), seq: p.seq, outcome, say: sent.say ?? null, at })
  }

  return {
    async listen(session: ListeningSession, payload: ListenPayload): Promise<void> {
      latest.set(session, Math.max(latest.get(session) ?? Number.NEGATIVE_INFINITY, payload.seq))
      const rec: CallRecord = { payload, started: null, ended: null, raw: null, usage: null, threw: false, sent: null }
      await calls.run(rec, () => listening.listen(session, payload))
      report(session, rec)
    },
    style: listening.style,
    played(session: ListeningSession, lineId: string): void {
      listening.played(session, lineId)
      const line = lines.get(lineId)
      if (!line) return
      lines.delete(lineId)
      out.line({ id: newId(), lineId, text: line.text, stored: line.stored, at: deps.now() })
    },
  }
}
