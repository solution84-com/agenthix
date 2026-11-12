/**
 * The demo's voice call, in place of the real one (live demo spec, *Voice is in, as a demo voice*): no microphone, no
 * speech service and nothing sent to hq's voice service. The agent's first line is played, the person taps a line, it
 * goes into the thread as their message, and the agent's reply — written as text as in any conversation — is played
 * from its recorded clip. It has the real session's shape, so the call bar and the thread read it the same way.
 */
import { CONVERSATION_SOCKET, type ConversationDeltaEvent, type ConversationMessageEvent, type ConversationTurnEvent, type SendConversationMessageArgs } from '../../shared/conversations/protocol'
import type { LooseSocket } from '../../conversations/voiceClient/adapters/hqSocket'
import { IDLE, type Reveal, type VoiceSnapshot } from '../../conversations/voiceClient/voiceSnapshot'
import type { TimedSentence } from '../../conversations/voiceClient/reveal'
import type { VoiceRuntimeHandle } from '../../conversations/voiceClient/runtime/types'
import { randomId } from '../../shared/randomId'

export type ClipPlay = {
  ended: Promise<void>
  stop: () => void
  mute: (muted: boolean) => void
  /** The clip's length in seconds once known; null when it cannot be told. Absent: the reply's text is not paced. */
  duration?: Promise<number | null>
}
export type DemoLine = { text: string; clip: string | null }

export type DemoVoiceDeps = {
  socket: LooseSocket
  sendMessage: (args: SendConversationMessageArgs) => Promise<unknown>
  /** Plays a recorded clip by name; `ended` settles when it ends, is stopped or cannot play. */
  playClip: (clip: string) => ClipPlay
  /** What the agent (by its handle) says first; null when the demo has none for it. */
  firstLine: (handle: string | undefined) => DemoLine | null
  /** The clip that speaks a line the lead said by itself (work came back, done…), by the agent's handle and the line's text; null for none. */
  spokenLine?: (handle: string | undefined, text: string) => string | null
  newId?: () => string
  /** Milliseconds now; real time when not given. */
  now?: () => number
}

/** How often the reply's text is advanced while its clip plays. */
const REVEAL_TICK_MS = 60

/** The reply's text, as far as it has arrived, laid over the clip's length as one sentence, word by word. */
function paced(turnId: string, text: string, seconds: number, elapsed: number): Reveal {
  const words = text.match(/\S+/g) ?? []
  const each = words.length === 0 ? 0 : seconds / words.length
  const sentence: TimedSentence & { wordEndSecs: number[] } = {
    index: 0, textStart: 0, textEnd: text.length, words,
    wordStartSecs: words.map((_, i) => i * each), wordEndSecs: words.map((_, i) => (i + 1) * each),
  }
  return { turnId, head: { index: 0, elapsed: Math.min(seconds, elapsed), ended: false }, sentences: [sentence] }
}

export function createDemoVoiceSession(deps: DemoVoiceDeps) {
  const newId = deps.newId ?? randomId
  const now = deps.now ?? Date.now
  let snap: VoiceSnapshot = IDLE
  const listeners = new Set<() => void>()
  let playing: ClipPlay | null = null
  /** The tapped line whose reply is awaited; `started` once its clip has begun. */
  let pending: { clip: string | null; started: boolean } | null = null

  const set = (patch: Partial<VoiceSnapshot>) => {
    snap = { ...snap, ...patch }
    listeners.forEach(l => l())
  }
  const mine = (e: { conversationId: string }) => snap.conversationId !== null && e.conversationId === snap.conversationId

  /** The reply whose text is paced to its clip: its words as they arrive, and when its clip began. */
  let shown: { turnId: string; startedAt: number; seconds: number | null } | null = null
  /** What each turn has written so far, from its stream and its stored message. */
  const texts = new Map<string, string>()
  const seenMessages = new Set<string>()
  let ticker: ReturnType<typeof setInterval> | null = null

  const stopTicker = () => { if (ticker !== null) { clearInterval(ticker); ticker = null } }
  const clearReveal = () => {
    stopTicker()
    shown = null
    if (snap.reveal) set({ reveal: null })
  }
  const advance = () => {
    if (!shown) return
    if (shown.seconds === null) { set({ reveal: { turnId: shown.turnId, head: null, sentences: [] } }); return }
    set({ reveal: paced(shown.turnId, texts.get(shown.turnId) ?? '', shown.seconds, (now() - shown.startedAt) / 1000) })
  }
  /** Pace the turn's text to the clip's length; a clip whose length is not known leaves the text as it streams. */
  const pace = (turnId: string, p: ClipPlay) => {
    if (!p.duration) return
    shown = { turnId, startedAt: now(), seconds: null }
    advance()
    void p.duration.then(seconds => {
      if (playing !== p || !shown || shown.turnId !== turnId) return
      if (seconds === null || !(seconds > 0)) { clearReveal(); return }
      shown.seconds = seconds
      advance()
      ticker = setInterval(advance, REVEAL_TICK_MS)
    })
  }

  const stopClip = () => {
    const was = playing
    playing = null
    clearReveal()
    was?.stop()
  }

  const play = (clip: string, then: () => void) => {
    stopClip()
    const p = deps.playClip(clip)
    p.mute(snap.muted)
    playing = p
    set({ phase: 'speaking' })
    void p.ended.then(() => { if (playing === p) { playing = null; clearReveal(); then() } })
    return p
  }

  /** The lead's own lines that came while something else was said, spoken in turn once it ends. */
  const queued: string[] = []
  const listening = () => {
    if (snap.phase === 'off') return
    const next = queued.shift()
    if (next) play(next, listening)
    else set({ phase: 'listening' })
  }

  const replyStarts = (turnId: string) => {
    const wait = pending
    if (!wait || wait.started) return
    wait.started = true
    if (wait.clip) pace(turnId, play(wait.clip, () => { pending = null; listening() }))
  }

  const onDelta = (e: ConversationDeltaEvent) => {
    if (!mine(e) || snap.phase === 'off') return
    texts.set(e.turnId, (texts.get(e.turnId) ?? '').slice(0, e.offset) + e.text)
    replyStarts(e.turnId)
  }
  /** The lead's own lines (its work came back, it is done…) are spoken from their clips; one with no clip stays text. */
  const onMessage = (e: ConversationMessageEvent) => {
    if (!mine(e) || snap.phase === 'off') return
    const m = e.message
    if (m.role !== 'AGENT' || m.kind !== 'TEXT') return
    const text = (m.body as { text?: unknown }).text
    if (typeof text !== 'string') return
    if (m.turnId) texts.set(m.turnId, text)
    if (seenMessages.has(m.id) || !deps.spokenLine) return
    seenMessages.add(m.id)
    const clip = deps.spokenLine(snap.agent?.handle, text.trim())
    if (!clip) return
    // A run that ends while its reply is still being said comes back after it, never over it.
    if (pending || snap.phase !== 'listening') queued.push(clip)
    else play(clip, listening)
  }
  const onTurn = (e: ConversationTurnEvent) => {
    if (!mine(e) || snap.phase === 'off' || !pending || e.state === 'QUEUED' || e.state === 'RUNNING') return
    if (e.state === 'COMPLETED') replyStarts(e.turnId)
    else pending.started = true
    // A reply with no clip, or one that failed, is over with its text.
    if (!playing) { pending = null; listening() }
  }
  deps.socket.on(CONVERSATION_SOCKET.delta, onDelta as never)
  deps.socket.on(CONVERSATION_SOCKET.turn, onTurn as never)
  deps.socket.on(CONVERSATION_SOCKET.message, onMessage as never)

  const teardown = () => {
    queued.length = 0
    stopClip()
    texts.clear()
    pending = null
    snap = { ...IDLE }
    listeners.forEach(l => l())
  }

  return {
    snapshot: () => snap,
    runtime: (): VoiceRuntimeHandle | null => null,
    prepare: (_agentId?: string, _conversationId?: string) => undefined,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
    start(conversationId: string, agent: VoiceSnapshot['agent'], returnTo: string) {
      if (snap.phase !== 'off') return
      snap = { ...IDLE, conversationId, agent, returnTo, phase: 'listening' }
      const first = deps.firstLine(agent?.handle)
      if (first?.clip) play(first.clip, listening)
      else listeners.forEach(l => l())
    },
    /** The person taps a line: it is sent as their message, and the reply's clip plays as its text streams in. */
    say(line: DemoLine) {
      const conversationId = snap.conversationId
      if (!conversationId || snap.phase !== 'listening') return
      pending = { clip: line.clip, started: false }
      set({ phase: 'thinking', notice: null, noticeFor: null })
      deps.sendMessage({ conversationId, clientMessageId: newId(), text: line.text }).catch((err: unknown) => {
        const why = err instanceof Error && err.message.trim() ? err.message.trim() : 'That did not work.'
        pending = null
        if (snap.phase !== 'off') set({ phase: 'listening', notice: `Your words were not sent. ${why}`, noticeFor: conversationId })
      })
    },
    end() { if (snap.conversationId) teardown() },
    toggleMute() {
      if (snap.phase === 'off') return
      const muted = !snap.muted
      set({ muted })
      playing?.mute(muted)
    },
    stopSpeaking(): boolean {
      if (snap.phase !== 'speaking') return false
      pending = null
      stopClip()
      set({ phase: 'listening' })
      return true
    },
    clearNotice() { if (snap.notice) set({ notice: null, noticeFor: null }) },
    closing() { teardown() },
    dispose() {
      deps.socket.off(CONVERSATION_SOCKET.delta, onDelta as never)
      deps.socket.off(CONVERSATION_SOCKET.turn, onTurn as never)
      deps.socket.off(CONVERSATION_SOCKET.message, onMessage as never)
      teardown()
    },
  }
}

export type DemoVoiceSession = ReturnType<typeof createDemoVoiceSession>
