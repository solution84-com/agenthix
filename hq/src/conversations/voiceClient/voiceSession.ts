/**
 * Voice in a conversation, for the one browser that holds it, apart from React: the snapshot the provider draws,
 * and, while voice is on, the runtime every layer runs on (`voiceParts`): Acoustic hears the person, STT turns it
 * into words, Semantics decides when their turn ends, and Orchestration decides who holds the floor and sends what
 * they said.
 *
 * What it keeps: whether voice is starting or on, what the person is saying, which reply is being held back so its
 * text fills in step with the audio (`reveal`), and the one line shown when voice ends or a part of it fails. The
 * rules about holders, silence and what is recorded are hq's; this reads them.
 */
import { hqVoice, listenToRoom, type LooseSocket } from './adapters/hqSocket'
import { createSpeaker } from './adapters/speaker'
import { turnEnded } from './heardCut'
import { realClock, type Clock } from './clock'
import { playChime } from './playback'
import type { VoiceRuntime, VoiceRuntimeHandle } from './runtime/types'
import type { SttToken } from './stt'
import { TOKEN_FRESH_MS } from './stt/tokens'
import { VOICE_SETTINGS } from './settings'
import { createVoiceParts } from './voiceParts'
import { IDLE, type Reveal, type VoiceDeps, type VoicePhase, type VoiceSnapshot } from './voiceSnapshot'
import { randomId } from '../../shared/randomId'

export type { LooseSocket, Reveal, VoiceDeps, VoicePhase, VoiceSnapshot }

/** The server hears of speech at most this often, to keep the silence rule from ending voice. */
const ACTIVITY_EVERY_MS = 5_000

/** The reason inside a speech-to-text failure line, without its lead-in and closing full stop. */
const reasonOf = (message: string) => message.replace(/^Speech to text stopped: /, '').replace(/\.$/, '')

export function createVoiceSession(deps: VoiceDeps) {
  const { userId } = deps
  const now = deps.now ?? deps.clock?.now ?? Date.now
  const clock: Clock = deps.clock ?? { ...realClock(), now }
  const newId = deps.newId ?? randomId
  const hq = hqVoice(deps.socket)
  let snap: VoiceSnapshot = IDLE
  const listeners = new Set<() => void>()
  let runtime: VoiceRuntime | null = null
  let stopMirror: (() => void) | null = null
  let lastActivity = 0
  /** A token fetched before the speech connection needs it: the fetch takes seconds, and audio held meanwhile is lag. */
  let prepared: { at: number; agentId: string | undefined; conversationId: string | undefined; token: Promise<SttToken> } | null = null
  const prepare = (agentId?: string, conversationId?: string) => {
    if (prepared && prepared.agentId === agentId && prepared.conversationId === conversationId && now() - prepared.at < TOKEN_FRESH_MS) return
    const token = deps.getToken(agentId, conversationId)
    token.catch(() => undefined)
    prepared = { at: now(), agentId, conversationId, token }
  }
  const getToken = (): Promise<SttToken> => {
    const p = prepared
    prepared = null
    const agentId = snap.agent?.id
    const conversationId = snap.conversationId ?? undefined
    return p && p.agentId === agentId && p.conversationId === conversationId && now() - p.at < TOKEN_FRESH_MS
      ? p.token.catch(() => deps.getToken(agentId, conversationId)) : deps.getToken(agentId, conversationId)
  }

  const set = (patch: Partial<VoiceSnapshot>) => {
    snap = { ...snap, ...patch }
    listeners.forEach(l => l())
  }
  const mine = (e: { conversationId: string }) => snap.conversationId !== null && e.conversationId === snap.conversationId
  const speaker = createSpeaker({ snapshot: () => snap, set, createPlayback: deps.createPlayback, hq, runtime: () => runtime })

  const teardown = (notice: string | null) => {
    speaker.reset()
    const running = runtime
    runtime = null
    stopMirror?.()
    stopMirror = null
    running?.stop()
    snap = { ...IDLE, notice, noticeFor: notice ? snap.conversationId : null }
    listeners.forEach(l => l())
  }

  const send = (text: string, trailedOff = false) => {
    const conversationId = snap.conversationId
    if (!conversationId) return
    set({ partial: '', phase: 'thinking' })
    deps.sendMessage({ conversationId, clientMessageId: newId(), text, spoken: true, ...(trailedOff && { trailedOff }) }).catch((err: unknown) => {
      const why = err instanceof Error && err.message.trim() ? err.message.trim() : 'That did not work.'
      if (snap.phase !== 'off') set({ phase: 'listening', notice: `Your words were not sent. ${why}`, noticeFor: conversationId })
    })
  }

  /** What the runtime decides that the screen and hq hear of. */
  const listen = (rt: VoiceRuntimeHandle) => {
    rt.subscribe(['stt.person'], (e) => {
      if (e.committed) return
      if (snap.warningEndsAt) set({ warningEndsAt: null })
      if (snap.conversationId && now() - lastActivity > ACTIVITY_EVERY_MS) {
        lastActivity = now()
        hq.activity(snap.conversationId)
      }
    })
    rt.subscribe(['stt.utterance'], e => set({ partial: e.text }))
    // A message joined to the last one goes as hq's `continue`, from Orchestration's own adapter.
    rt.subscribe(['orchestration.send'], e => { if (e.append) set({ partial: '', phase: 'thinking' }); else send(e.text, e.trailedOff) })
  }

  const endFailed = (notice: string, failed?: 'speech-to-text') => {
    const id = snap.conversationId
    if (id) hq.end(id, failed)
    teardown(notice)
  }

  const openVoice = () => {
    const base = deps.settings ?? VOICE_SETTINGS
    const rt = createVoiceParts({
      ...deps,
      settings: { ...base, adaptiveVoice: deps.adaptiveVoice?.() ?? base.adaptiveVoice },
      clock, getToken, set, speaker: speaker.adapter, sendNew: send,
      socket: deps.socket,
      conversationId: () => snap.conversationId,
      chime: deps.chime ?? (() => playChime()),
      opened: () => { if (runtime === rt && snap.phase === 'starting') set({ phase: 'listening' }) },
      microphoneFailed: (err) => { if (runtime === rt) endFailed(err instanceof Error ? err.message : 'The microphone could not be used.') },
      sttFailed: (message) => { if (runtime === rt) endFailed(`Voice stopped: ${reasonOf(message)}. You can keep typing.`, 'speech-to-text') },
    })
    runtime = rt
    listen(rt)
    stopMirror = deps.mirror?.(rt) ?? null
    rt.start()
  }

  const stopListening = listenToRoom(deps.socket, {
    state(e) {
      if (!mine(e)) return
      if (e.holderId === userId) { if (snap.phase === 'starting' && !runtime) openVoice(); return }
      // Someone else holds it, or nobody does: ours is over.
      teardown(snap.notice)
    },
    sentence(e) { if (mine(e) && snap.phase !== 'off' && snap.phase !== 'starting') speaker.sentence(e) },
    audio(e) { if (mine(e)) speaker.audio(e) },
    turnSpoken(e) { if (mine(e)) speaker.turnSpoken(e) },
    turnHeld(e) { if (mine(e) && snap.phase !== 'off' && snap.phase !== 'starting') speaker.held(e) },
    phrase(e) { if (mine(e)) speaker.phrase(e) },
    silenceWarning(e) { if (mine(e)) set({ warningEndsAt: now() + e.endsInMs }) },
    ended(e) { if (mine(e)) teardown(e.reason) },
    error(e) {
      if (!mine(e)) return
      if (snap.phase === 'starting') { teardown(e.message); return }
      // A failure in the middle: the reply is shown as written, with the reason beside it.
      speaker.failed()
      set({ notice: e.message, noticeFor: e.conversationId, phase: 'listening' })
    },
    delta(e) { if (mine(e) && snap.phase !== 'off' && snap.phase !== 'starting') speaker.delta(e) },
    turn(e) {
      turnEnded(e.turnId, e.state)
      if (mine(e) && e.state !== 'QUEUED' && e.state !== 'RUNNING') speaker.turn(e)
    },
    operation(e) { if (mine(e) && typeof e.outstanding === 'number') set({ outstanding: e.outstanding }) },
  })

  return {
    snapshot: () => snap,
    /** The runtime while voice is on, for the voice lab to watch; null otherwise. */
    runtime: (): VoiceRuntimeHandle | null => runtime,
    /** Voice may be started soon (its button is on screen): a token is fetched now, so starting does not wait. */
    prepare,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
    start(conversationId: string, agent: VoiceSnapshot['agent'], returnTo: string) {
      if (snap.phase !== 'off') return
      snap = { ...IDLE, conversationId, agent, returnTo, phase: 'starting' }
      listeners.forEach(l => l())
      lastActivity = now()
      prepare(agent?.id, conversationId)
      hq.start(conversationId)
    },
    end() {
      const id = snap.conversationId
      if (!id) return
      runtime?.publish({ kind: 'stt.flush', t: now() })
      speaker.endCall()
      hq.end(id)
      teardown(null)
    },
    toggleMute() {
      if (snap.phase === 'off') return
      const muted = !snap.muted
      set({ muted, partial: muted ? '' : snap.partial })
      runtime?.publish({ kind: 'stt.muted', muted, t: now() })
    },
    /** Stops the reply being spoken, as the person speaking over it would; false when none is. */
    stopSpeaking(): boolean {
      if (snap.phase !== 'speaking') return false
      runtime?.publish({ kind: 'person.tap', target: 'stop', t: now() })
      return true
    },
    clearNotice() { if (snap.notice) set({ notice: null, noticeFor: null }) },
    /** The tab is closing: voice ends, and the reply being spoken keeps only what was heard, as on End. */
    closing() {
      const id = snap.conversationId
      if (!id) return
      speaker.endCall()
      hq.end(id)
    },
    dispose() {
      stopListening()
      teardown(null)
    },
  }
}

export type VoiceSession = ReturnType<typeof createVoiceSession>
