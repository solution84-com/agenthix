/**
 * The listening family's three tiers (voice that stays in the conversation, spec §3), and how hq names a clip of
 * each when it sends the stored phrases as voice starts. The stored phrase event already carries a `use` and a
 * `tier`, so the tiers travel in them: a hum and an acknowledging word are both active listening, told apart by
 * the tier; an invitation is an encouragement phrase.
 */
import type { VoiceSettings } from '../settings'

export type ListeningTier = 'hum' | 'acknowledge' | 'invitation'

export type ListeningUse = 'active-listening' | 'encouragement'

type Clips = { use: ListeningUse; tier: number; texts: (s: VoiceSettings['listening']) => string[]; directions: (s: VoiceSettings['listening']) => string[] }

export const LISTENING_CLIPS: Record<ListeningTier, Clips> = {
  hum: { use: 'active-listening', tier: 1, texts: s => s.hums, directions: s => s.directions.hums },
  acknowledge: { use: 'active-listening', tier: 2, texts: s => s.acknowledging, directions: s => s.directions.acknowledging },
  invitation: { use: 'encouragement', tier: 3, texts: s => s.invitations, directions: s => s.directions.invitations },
}

/** The tier of a stored phrase hq sent; any other active listening phrase is taken for a hum. */
export function listeningTierOf(use: ListeningUse, tier: number): ListeningTier {
  if (use === 'encouragement') return 'invitation'
  return tier === LISTENING_CLIPS.acknowledge.tier ? 'acknowledge' : 'hum'
}
