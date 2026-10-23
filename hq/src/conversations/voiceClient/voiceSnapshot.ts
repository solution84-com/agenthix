/** What voice in a conversation shows, and what a voice session is built from. */
import type { SendConversationMessageArgs } from '../../shared/conversations/protocol'
import type { LooseSocket } from './adapters/hqSocket'
import type { Clock } from './clock'
import type { Playback, Playhead } from './playback'
import type { TimedSentence } from './reveal'
import type { VoiceRuntimeHandle } from './runtime/types'
import type { SttToken } from './stt'
import type { VoiceOutside } from './voiceParts'

/** A reply held back so its text is shown only as far as it has been heard. */
export type Reveal = { turnId: string; head: Playhead | null; sentences: TimedSentence[] }

export type VoicePhase = 'off' | 'starting' | 'listening' | 'thinking' | 'speaking'

export type VoiceSnapshot = {
  conversationId: string | null
  agent: { id?: string; name: string; avatarUrl: string | null } | null
  /** Where the person was when they started: the bar on other pages leads back here. */
  returnTo: string | null
  phase: VoicePhase
  muted: boolean
  /** What the person is saying now, before it is sent. */
  partial: string
  reveal: Reveal | null
  /** When voice ends unless someone speaks. */
  warningEndsAt: number | null
  /** One line: why voice ended, or what failed. */
  notice: string | null
  /** The conversation the notice is about; it outlives the voice that wrote it. */
  noticeFor: string | null
  outstanding: number | null
  // Optional, so a snapshot written before the hand-raise (such as the provider's own "off") still type-checks.
  /** An agent's raised hand, waiting for an opening or the person's invitation; null when there is none. */
  handRaise?: { updateId: string; critical: boolean } | null
  /** The speech connection is being replaced: the pill says "Reconnecting…". */
  reconnecting?: boolean
}

export type VoiceDeps = VoiceOutside & {
  socket: LooseSocket
  userId: string
  createPlayback: () => Playback
  /** A speech token from hq, for the organisation's speech service. */
  /** `agentId`: whose own speech to text to use; none means the organisation's default. */
  getToken: (agentId?: string) => Promise<SttToken>
  sendMessage: (args: SendConversationMessageArgs) => Promise<unknown>
  now?: () => number
  newId?: () => string
  /** The runtime's clock; real time on `now` when not given. */
  clock?: Clock
  /** The soft sound of a raised hand. */
  chime?: () => void
  /** Shows the running runtime to the voice lab in another tab (development only); returns what stops it. */
  mirror?: (runtime: VoiceRuntimeHandle) => () => void
}

export const IDLE: VoiceSnapshot = {
  conversationId: null, agent: null, returnTo: null, phase: 'off', muted: false, partial: '', reveal: null,
  warningEndsAt: null, notice: null, noticeFor: null, outstanding: null, handRaise: null, reconnecting: false,
}
