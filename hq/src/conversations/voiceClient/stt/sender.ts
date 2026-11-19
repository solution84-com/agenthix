/**
 * The inbound loop (adaptive voice spec, The real-time runtime): the person's audio, frame by frame, to the speech
 * service, and its words back as `stt.words`, with the connection's state as `stt.status` and its lag as `stt.lag`.
 *
 * - Audio goes out at the pace of speech while the connection takes it, faster while a backlog waits (after a
 *   connection is replaced, the audio it had not heard is sent again); the rest waits in the send queue, and past
 *   `inbound.queueLimitMs` the connection is replaced. Past `inbound.replaceAboveLagMs` of the connection's own lag
 *   (from a word's audio sent to the word), it is replaced at the next pause, at once at twice the limit.
 * - A replacement in a pause waits until the connection has heard what came before it (closing it sooner throws
 *   away words it is about to send), or the person speaks again. A fresh connection, on a token fetched ahead, is
 *   given the audio from the start of the last word heard, silence left out; the reconciler lines up their words.
 * - A message sent keeps the connection: its words are committed, and the words after them begin the next message.
 *   A fresh connection for every message doubled the sessions opened, past the service's limit on new sessions.
 * - Never a gap in the audio mid-connection (a gap made the service go quiet for 20–40 s, with no error): after
 *   `inbound.idleAfterSilenceMs` of silence, once it has heard what came before, the connection is closed (`idle`);
 *   the person's next speech opens a fresh one, from the moment before it.
 *
 * A replacement is asked for with `stt.replace`, and made only when that event arrives, so each is in the log.
 */
import type { Clock } from '../clock'
import type { SttState, VoiceEventInput } from '../events'
import type { SpeechToText } from '../ports'
import type { VoiceSettings } from '../settings'
import { lagMeter, timedWords } from './lag'
import { connectLink, type Link } from './link'
import { begin, cut, heard, NO_WORDS, resumePoint, settle, type ReconcilerState, type WordsOut } from './reconciler'
import { capQueue, leaveOutSilence, msOf, paced, resumeFrom, type Frame, type Pace } from './sendQueue'
import { tokensAhead } from './tokens'

export type ReplaceReason = Extract<VoiceEventInput, { kind: 'stt.replace' }>['reason']

export type SenderDeps<T> = {
  clock: Clock
  settings: () => VoiceSettings
  getToken: () => Promise<T>
  /** The speech service on one token, with the settings as it connects. */
  service: (token: T, settings: VoiceSettings) => SpeechToText
  publish: (event: VoiceEventInput) => void
  /** The speech service could not be reached again: voice cannot go on. */
  failed?: (message: string) => void
}

const SAMPLES_PER_MS = 16

export function createSender<T>(deps: SenderDeps<T>) {
  const { clock } = deps
  const inbound = () => deps.settings().inbound
  const tokens = tokensAhead(deps.getToken, clock)
  let link: Link | null = null
  let nextId = 0
  let words: ReconcilerState = NO_WORDS
  let queue: Frame[] = []
  /** Sent, and not yet heard back. */
  let sent: Frame[] = []
  let pace: Pace = { budgetMs: 0, at: null }
  /** The backlog a fresh connection started with, less what it has caught up since. */
  let allowanceMs = 0
  let [speech, muted, stopped, failures] = [false, false, true, 0]
  let status: SttState | null = null
  const lag = lagMeter()
  let asked: ReplaceReason | null = null
  /** Silence sent since the last speech; since when it has been enough to close; closed for it: where words count from. */
  let silenceSentMs = 0
  let quietSince: number | null = null
  let idleFrom: number | null = null
  /** What a connection opened for speech after silence sends at once. */
  let wakeGrantMs = 0
  /** When the last speech sent was captured, and when the pause now going on began (null while speaking). */
  let lastSpeechAt = -Infinity
  let pauseSince: number | null = null
  /** A replacement waiting for the connection to hear what came before the pause, and since when. */
  let waiting: { reason: ReplaceReason; since: number } | null = null

  const now = () => clock.now()
  const setStatus = (state: SttState, reason?: string) => {
    if (state === status) return
    status = state
    deps.publish({ kind: 'stt.status', state, ...(reason ? { reason } : {}), t: now() })
  }
  const emitWords = (out: WordsOut[]) => { for (const w of out) deps.publish({ kind: 'stt.words', ...w, t: now() }) }
  const backlogMs = () => msOf(queue) + (link?.conn?.bufferedMs() ?? 0)

  const ask = (reason: ReplaceReason) => {
    if (asked || !link?.conn) return
    asked = reason
    deps.publish({ kind: 'stt.replace', reason, t: now() })
  }

  const pump = () => {
    const conn = link?.conn
    if (!conn || !link) return
    const { prerollMs, slackMs, queueLimitMs, catchUpAboveMs, catchUpRate } = inbound()
    pace = paced(pace, now(), msOf(queue) > catchUpAboveMs ? catchUpRate : 1)
    // Silence is left out only while the connection takes audio, so a stalled one shows as a full queue.
    if (conn.bufferedMs() < slackMs) queue = leaveOutSilence(queue, prerollMs)
    while (queue.length && pace.budgetMs >= queue[0]!.ms && conn.bufferedMs() < slackMs) {
      const frame = queue.shift()!
      conn.send(frame.pcm)
      link.clock.sent(frame.ms, frame.t, now())
      sent.push(frame)
      pace = { ...pace, budgetMs: pace.budgetMs - frame.ms }
      silenceSentMs = frame.speech ? 0 : silenceSentMs + frame.ms
      if (frame.speech) lastSpeechAt = frame.t
    }
    while (sent.length > 1 && msOf(sent) > inbound().keepMs) sent.shift()
    const backlog = backlogMs()
    allowanceMs = Math.min(allowanceMs, backlog)
    lag.queued(backlog)
    if (backlog - allowanceMs >= queueLimitMs) ask('queue-full')
    checkIdle()
  }

  /** Long enough silence on a connection that has heard what came before it: it is closed until the next speech. */
  const checkIdle = () => {
    const { idleAfterSilenceMs, catchUpGraceMs } = inbound()
    if (!link?.conn || waiting || asked || silenceSentMs < idleAfterSilenceMs || queue.some(f => f.speech)) {
      quietSince = null
      return
    }
    quietSince ??= now()
    if (!caughtUp() && now() - quietSince < lag.connectionMs() + catchUpGraceMs) return
    const step = cut(words, link.id, 'commit')
    words = step.state
    emitWords(step.emit)
    link.conn.close()
    link = null
    idleFrom = step.from
    sent = []
    quietSince = null
    setStatus('idle')
  }

  /** Speech again after the connection was closed for silence: a fresh one, given the moment before the speech at once. */
  const wake = () => {
    const from = idleFrom
    idleFrom = null
    // The audio just before detection said voice is heard as speech: it often holds the first word.
    const first = queue.findIndex(f => f.speech)
    let marked = 0
    for (let i = first - 1; i >= 0 && marked < inbound().wakePrerollMs; i--) {
      queue[i] = { ...queue[i]!, speech: true }
      marked += queue[i]!.ms
    }
    wakeGrantMs = msOf(queue)
    open(from ?? -Infinity, 'connecting')
  }

  const caughtUp = () => words.heardUntil >= lastSpeechAt - inbound().caughtUpMs
  const checkLag = () => {
    const limit = inbound().replaceAboveLagMs
    const ms = lag.connectionMs()
    if (ms > 2 * limit || (ms > limit && pauseSince !== null)) ask('lagging')
  }

  const checkWaiting = () => {
    const w = waiting
    if (w && (pauseSince === null || caughtUp() || now() - w.since >= lag.connectionMs() + inbound().catchUpGraceMs)) replaceNow(w.reason)
  }

  const open = (from: number, state: SttState) => {
    const mine = connectLink(nextId++, {
      clock, timeoutMs: inbound().connectTimeoutMs, current: () => link,
      token: () => tokens.take().then(t => deps.service(t, deps.settings())),
    }, {
      words(l, text, service, committed, turn) {
        if (muted) return
        l.gotWords = true
        failures = 0
        const step = heard(words, l.id, { text, words: timedWords(l.clock, service), committed, turn })
        words = step.state
        const keepFrom = resumePoint(words) - inbound().prerollMs
        sent = sent.filter(f => f.t > keepFrom)
        emitWords(step.emit)
        // Last: it may replace this connection, which needs these words already heard.
        lag.heard(l, service, now())
        checkLag()
        checkWaiting()
      },
      voiceProfile(_l, profile, final) {
        if (!muted) deps.publish({ kind: 'tone.voice', ...profile, final, t: now() })
      },
      opened() {
        pace = { budgetMs: wakeGrantMs, at: null }
        wakeGrantMs = 0
        silenceSentMs = 0
        allowanceMs = backlogMs()
        setStatus('open')
        tokens.fetchAhead()
        pump()
      },
      lost: (l, why) => lost(l, why),
      failed: (l, why) => failedAttempt(l, why),
    })
    link = mine
    words = begin(words, mine.id, from)
    lag.fresh()
    asked = null
    waiting = null
    setStatus(state)
  }

  const replaceNow = (reason: ReplaceReason) => {
    const l = link
    waiting = null
    if (stopped || !l) return
    const step = cut(words, l.id, 'carry')
    words = step.state
    emitWords(step.emit)
    // Already opening a fresh one: it is heard from the new point.
    if (!l.conn) { words = begin(words, l.id, step.from); return }
    l.conn.close()
    handOver(step.from)
    open(step.from, 'reconnecting')
  }

  /** Everything not yet heard back, ready for the next connection, and where its words begin to count. */
  const handOver = (from: number) => {
    queue = resumeFrom([...sent, ...queue], from, inbound().prerollMs)
    sent = []
  }

  const failedAttempt = (l: Link, why: string) => {
    l.conn?.close()
    failures++
    const from = resumePoint(words)
    handOver(from)
    if (failures >= inbound().failuresBeforeFailed) {
      link = null
      setStatus('failed', why)
      deps.failed?.(`Speech to text stopped: ${why}.`)
      return
    }
    link = { ...l, conn: null }
    setStatus('reconnecting', why)
    clock.after(inbound().retryMs * failures, () => { if (!stopped && link?.id === l.id) open(from, 'reconnecting') })
  }

  /** The service closed the connection, or reported an error on it, without being asked. */
  const lost = (l: Link, why: string) => {
    const step = cut(words, l.id, 'carry')
    words = step.state
    if (!l.gotWords) { failedAttempt(l, why); return }
    deps.publish({ kind: 'stt.replace', reason: 'dropped', t: now() })
    l.conn?.close()
    handOver(step.from)
    open(step.from, 'reconnecting')
  }

  return {
    start() {
      if (!stopped) return
      stopped = false
      failures = 0
      open(-Infinity, 'connecting')
    },
    stop() {
      stopped = true
      link?.conn?.close()
      link = null
      idleFrom = null
      queue = []; sent = []
      tokens.clear()
    },
    frame(pcm: Int16Array, t: number) {
      if (stopped || muted) return
      const { keepMs, prerollMs, wakePrerollMs } = inbound()
      queue.push({ pcm, t, ms: pcm.length / SAMPLES_PER_MS, speech })
      queue = capQueue(queue, keepMs, prerollMs).frames
      if (idleFrom !== null) {
        queue = leaveOutSilence(queue, wakePrerollMs)
        if (speech) wake()
        return
      }
      pump()
    },
    /** `t`: when the voice or the silence began. */
    silence(silent: boolean, t: number) {
      speech = !silent
      pauseSince = silent ? (pauseSince ?? t) : null
      checkLag()
      checkWaiting()
    },
    setMuted(value: boolean) { muted = value },
    tick() {
      if (stopped) return
      tokens.refresh()
      pump()
      checkLag()
      checkWaiting()
      const changed = lag.changed()
      if (changed) deps.publish({ kind: 'stt.lag', ...changed, t: now() })
    },
    /** The person's turn is over: the service is asked to finish the turn it is hearing. */
    endTurn() { link?.conn?.endTurn() },
    /** The person's message was sent: its words are committed, and the connection kept for the next. */
    sent() {
      if (!link) return
      const step = settle(words, link.id)
      words = step.state
      emitWords(step.emit)
    },
    /** `stt.replace` arrived: replaces the connection now, or once it has heard what came before this pause. */
    replace(reason: ReplaceReason) {
      // A dropped connection is already being replaced; the event is its record.
      if (reason === 'dropped') return
      if (reason === 'lagging' && link?.conn && pauseSince !== null && !caughtUp()) {
        waiting = waiting ?? { reason, since: now() }
        return
      }
      replaceNow(reason)
    },
  }
}

export type Sender = ReturnType<typeof createSender>
