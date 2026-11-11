/** What the screen says about voice, apart from React: the right button, who is talking, the quiet lines. */
import type { VoiceSnapshot } from './voiceSession'
import { SECURE_PAGE_WORDS } from '../../shared/securePage'

export type RightButton =
  | { kind: 'send' }
  | { kind: 'stop' }
  | { kind: 'end' }
  | { kind: 'voice'; disabledReason: string | null }

/**
 * The pill's one right button: with text it sends; in a call it ends the call (the button that started it); while a
 * reply runs it stops; empty it starts voice (greyed, with the reason, when it cannot).
 */
export function rightButton(input: {
  hasText: boolean
  running: boolean
  inVoice: boolean
  available: boolean
  reason: string | null
  heldByOther: boolean
}): RightButton {
  if (input.hasText) return { kind: 'send' }
  if (input.inVoice) return { kind: 'end' }
  if (input.running) return { kind: 'stop' }
  if (input.heldByOther) return { kind: 'voice', disabledReason: 'Someone else is using voice in this conversation.' }
  if (!input.available) return { kind: 'voice', disabledReason: input.reason || 'Voice is not available here.' }
  return { kind: 'voice', disabledReason: null }
}

/**
 * Whether voice can start on this page: hq's answer first, since a page made secure would not help an HQ with no
 * voice; then the page itself, which must be secure for the microphone.
 */
export function voiceHere(hq: { available: boolean; unavailableReason: string | null }, securePage: boolean): { available: boolean; reason: string | null } {
  if (!hq.available) return { available: false, reason: hq.unavailableReason }
  if (!securePage) return { available: false, reason: SECURE_PAGE_WORDS }
  return { available: true, reason: null }
}

export type Speaker = 'person' | 'agent' | 'listening' | 'muted' | 'none'

/** Who is talking: the person while words are coming in, the agent while its voice plays. */
export function speakerOf(voice: Pick<VoiceSnapshot, 'phase' | 'muted' | 'partial'>): Speaker {
  if (voice.phase === 'off' || voice.phase === 'starting') return 'none'
  if (voice.muted) return 'muted'
  if (voice.partial.trim()) return 'person'
  if (voice.phase === 'speaking') return 'agent'
  return 'listening'
}

export function speakerWords(speaker: Speaker, agentName: string | undefined): string {
  switch (speaker) {
    case 'person': return 'You are speaking'
    case 'agent': return `${agentName ?? 'The agent'} is speaking`
    case 'muted': return 'Muted'
    case 'listening': return 'Listening'
    default: return ''
  }
}

/** Why the call bar's mic is dimmed: the speech connection is being replaced. Said in its tooltip, never as a line. */
export const RECONNECTING_REASON = 'Reconnecting: the speech connection is being replaced. What you say is heard again in a moment.'

/** The raised-hand badge's words: who has an update, and that a tap hears it. */
export function handRaiseWords(agentName: string | undefined): string {
  return `${agentName ?? 'An agent'} has an update. Tap to hear it now.`
}

/** The ring on the pill and the glow behind the thread, by token. */
export const SPEAKER_RING: Record<Speaker, string> = {
  person: 'ring-2 ring-accent',
  agent: 'ring-2 ring-success',
  listening: 'ring-2 ring-border-strong',
  muted: 'ring-1 ring-border opacity-70',
  none: '',
}
export const SPEAKER_GLOW: Record<Speaker, string> = {
  person: 'from-accent/15',
  agent: 'from-success/15',
  listening: 'from-border-strong/20',
  muted: 'from-transparent',
  none: 'from-transparent',
}

/** "40 s", "4 min", "1 h 5 min". */
export function voiceLength(ms: number): string {
  const secs = Math.max(0, Math.round(ms / 1000))
  if (secs < 60) return `${secs} s`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}`
}
