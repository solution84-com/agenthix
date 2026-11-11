import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { playVoiceSound, soundOf } from '../../conversations/voiceClient/voiceSounds'
import { useLocation } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { getSpeechToken, getUserSettings, reportSpeechSession, sendConversationMessage, useQuery } from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import { CONVERSATION_SOCKET } from '../conversations/protocol'
import { createPlayback } from '../../conversations/voiceClient/playback'
import { revealedChars } from '../../conversations/voiceClient/reveal'
import type { VoiceRuntimeHandle } from '../../conversations/voiceClient/runtime/types'
import { mirrorRuntime } from '../../conversations/voiceClient/lab/mirror'
import { VOICE_HEARS } from '../../conversations/voiceClient/stt'
import { createVoiceSession, type LooseSocket, type VoiceSession, type VoiceSnapshot } from '../../conversations/voiceClient/voiceSession'

type Agent = NonNullable<VoiceSnapshot['agent']>

export type VoiceCallValue = {
  voice: VoiceSnapshot
  /**
   * The person asks for voice in a conversation; hq answers with who holds it. `returnTo`: where the bar on other
   * pages leads back to; the page they are on when not given.
   */
  start: (conversationId: string, agent: Agent | null, returnTo?: string) => void
  end: () => void
  toggleMute: () => void
  /** Stops the reply being spoken; false when none is, so the caller stops the turn itself. */
  stopSpeaking: () => boolean
  clearNotice: () => void
  /** Voice may be started soon (its button is under the pointer or focused): its speech token is fetched now. */
  prepare: (agentId?: string, conversationId?: string) => void
  /** How much of a reply's text may show: the part heard so far while it is being spoken, null for all of it. */
  revealLimit: (turnId: string | undefined, text: string) => number | null
  /** The voice runtime while voice is on, for the voice lab to watch; null otherwise. */
  runtime: () => VoiceRuntimeHandle | null
}

const OFF: VoiceSnapshot = {
  conversationId: null, agent: null, returnTo: null, phase: 'off', muted: false, partial: '', reveal: null,
  warningEndsAt: null, notice: null, noticeFor: null, outstanding: null,
}

// Without a provider (a test, a screen drawn alone) voice is simply off.
const INERT: VoiceCallValue = {
  voice: OFF, start: () => undefined, end: () => undefined, toggleMute: () => undefined,
  stopSpeaking: () => false, clearNotice: () => undefined, prepare: () => undefined, revealLimit: () => null,
  runtime: () => null,
}

const VoiceContext = createContext<VoiceCallValue>(INERT)

export function revealLimitOf(voice: VoiceSnapshot, turnId: string | undefined, text: string): number | null {
  const reveal = voice.reveal
  if (!reveal || !turnId || reveal.turnId !== turnId) return null
  return revealedChars(text, reveal.sentences, reveal.head)
}

const subscribeNone = () => () => undefined

function useSnapshot(session: VoiceSession | null): VoiceSnapshot {
  return useSyncExternalStore(
    session ? session.subscribe : subscribeNone,
    () => (session ? session.snapshot() : OFF),
    () => OFF,
  )
}

/**
 * Voice for the whole app, so it survives leaving the conversation page: the person's microphone, the speaker
 * and the one conversation voice is on in. Screens read it with `useVoiceCall`.
 */
export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const { socket } = useSocket()
  const { data: me } = useAuth()
  const location = useLocation()
  const userId = me?.id ?? null
  const [session, setSession] = useState<VoiceSession | null>(null)
  // The person's Adaptive voice, read as voice starts: a change in Settings applies from the next start.
  const { data: settings } = useQuery(getUserSettings, undefined, { enabled: !!userId })
  const adaptiveVoice = useRef(true)
  adaptiveVoice.current = settings?.adaptiveVoice ?? true
  const voiceSounds = settings?.voiceSounds ?? true

  useEffect(() => {
    if (!socket || !userId) { setSession(null); return }
    const made = createVoiceSession({
      socket: socket as unknown as LooseSocket,
      userId,
      createPlayback: () => createPlayback(),
      // Voice hears through Inworld or AssemblyAI, whichever hq gives the token for.
      getToken: async (agentId, conversationId) => (await getSpeechToken({ agentId, conversationId, hears: [...VOICE_HEARS] })) as never,
      reportSpeech: (session) => { void reportSpeechSession(session).catch(() => undefined) },
      sendMessage: (args) => sendConversationMessage(args),
      adaptiveVoice: () => adaptiveVoice.current,
      mirror: import.meta.env.DEV ? mirrorRuntime : undefined,
    })
    setSession(made)
    const leaving = () => made.closing()
    window.addEventListener('pagehide', leaving)
    return () => { window.removeEventListener('pagehide', leaving); made.dispose(); setSession(null) }
  }, [socket, userId])

  const voice = useSnapshot(session)

  // The call's few sounds, on its changes (voiceSounds.ts).
  const seen = useRef(voice)
  useEffect(() => {
    const sound = soundOf(seen.current, voice)
    seen.current = voice
    if (sound && voiceSounds) playVoiceSound(sound)
  }, [voice, voiceSounds])

  // The thread leaves its room when it unmounts; the bar on other pages still needs the room's events.
  useEffect(() => {
    if (!socket || !voice.conversationId) return
    ;(socket as unknown as LooseSocket).emit(CONVERSATION_SOCKET.subscribe, voice.conversationId)
  }, [socket, voice.conversationId, location.pathname])

  const path = location.pathname + location.search
  const value = useMemo<VoiceCallValue>(() => ({
    voice,
    start: (conversationId, agent, returnTo) => session?.start(conversationId, agent, returnTo ?? path),
    end: () => session?.end(),
    toggleMute: () => session?.toggleMute(),
    stopSpeaking: () => session?.stopSpeaking() ?? false,
    clearNotice: () => session?.clearNotice(),
    prepare: (agentId, conversationId) => session?.prepare(agentId, conversationId),
    revealLimit: (turnId, text) => revealLimitOf(voice, turnId, text),
    runtime: () => session?.runtime() ?? null,
  }), [session, voice, path])

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
}

export function useVoiceCall(): VoiceCallValue {
  return useContext(VoiceContext)
}
