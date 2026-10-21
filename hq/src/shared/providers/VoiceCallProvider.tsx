import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { getSpeechToken, sendConversationMessage } from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import { CONVERSATION_SOCKET } from '../conversations/protocol'
import { createPlayback } from '../../conversations/voiceClient/playback'
import { revealedChars } from '../../conversations/voiceClient/reveal'
import type { VoiceRuntimeHandle } from '../../conversations/voiceClient/runtime/types'
import { mirrorRuntime } from '../../conversations/voiceClient/lab/mirror'
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
  prepare: () => void
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

  useEffect(() => {
    if (!socket || !userId) { setSession(null); return }
    const made = createVoiceSession({
      socket: socket as unknown as LooseSocket,
      userId,
      createPlayback: () => createPlayback(),
      getToken: async () => (await getSpeechToken()) as never,
      sendMessage: (args) => sendConversationMessage(args),
      mirror: import.meta.env.DEV ? mirrorRuntime : undefined,
    })
    setSession(made)
    const leaving = () => made.closing()
    window.addEventListener('pagehide', leaving)
    return () => { window.removeEventListener('pagehide', leaving); made.dispose(); setSession(null) }
  }, [socket, userId])

  const voice = useSnapshot(session)

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
    prepare: () => session?.prepare(),
    revealLimit: (turnId, text) => revealLimitOf(voice, turnId, text),
    runtime: () => session?.runtime() ?? null,
  }), [session, voice, path])

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
}

export function useVoiceCall(): VoiceCallValue {
  return useContext(VoiceContext)
}
