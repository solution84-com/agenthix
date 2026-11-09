/**
 * The standard acknowledgement (voice that stays in the conversation, spec §1 "Slow or failed calls" and §3): a
 * stored phrase in the agent's voice ("Okay, bear with me.") that covers the wait when the agent's own reply has not
 * started by a generous ceiling, because its call is slow or failed. It plays once per message, never at once and
 * never as a ladder; a reply that starts first, or a turn hq says was held, leaves it unsaid. hq sends the phrases as
 * voice starts; until then, or without them, there are none.
 *
 * None of the last few said is said again while another can be, and never while the person holds the floor. The
 * reply that arrives while it plays waits for it to end; the person speaking stops it. It is part of no reply:
 * nothing of it is written into the conversation. A message sent as the person trailed off gets none: its answer is
 * most likely to invite them to go on, and "bear with me" before that would be wrong.
 */
import type { Playback } from '../playback'
import type { VoiceSettings } from '../settings'

/** `tier`: which tier of the stored set the phrase is, the shortest first. */
export type StoredClip = { text: string; audio: ArrayBuffer; tier: number }

export type Heard = {
  /** The phrase being heard now, or that has just ended. */
  text: string
  playing: boolean
  /** What went to the speaker since the last tick, at 16 kHz. */
  audio: Int16Array
}

type Settings = VoiceSettings['standardAcknowledgement']

export function createStandardAcknowledgement(deps: { createPlayback: () => Playback; random?: () => number }) {
  const random = deps.random ?? Math.random
  let clips: StoredClip[] = []
  /** The phrases said last, the latest first. */
  let said: string[] = []
  /** The wait being covered: when the phrase is due. Null when none is. */
  let plan: { due: number; settings: Settings } | null = null
  let playing: { playback: Playback; text: string } | null = null

  /** A phrase of the nearest tier to `settings.tier` that has any, the longer on a tie: none of the last `recent` if it can be, never the last. */
  const pick = ({ tier, recent }: Settings): StoredClip | null => {
    const tiers = [...new Set(clips.map(c => c.tier))].sort((a, b) => Math.abs(a - tier) - Math.abs(b - tier) || b - a)
    for (const t of tiers) {
      const ofTier = clips.filter(c => c.tier === t && c.text !== said[0])
      const fresh = ofTier.filter(c => !said.slice(0, recent).includes(c.text))
      const choices = fresh.length ? fresh : ofTier
      if (choices.length) return choices[Math.floor(random() * choices.length)]!
    }
    return null
  }

  const stop = () => {
    playing?.playback.close()
    playing = null
  }

  return {
    add(clip: StoredClip) { clips = [...clips, clip] },
    clear() { clips = []; said = [] },
    /** A message went at `at`: the phrase is due at the ceiling unless the reply starts first. */
    arm(at: number, settings: Settings, trailedOff = false) {
      plan = trailedOff ? null : { due: at + settings.ceilingMs, settings }
    },
    /** The reply began, will not come, or the turn was held: nothing is said, and one playing finishes. */
    disarm() { plan = null },
    /** The person spoke, the reply was stopped, or voice ended: nothing, and one playing stops at once. */
    cancel(): string | null {
      plan = null
      const text = playing?.text ?? null
      stop()
      return text
    },
    busy: () => playing !== null,
    /**
     * On each tick: at the ceiling, starts the phrase if it `may` (the floor is free, nothing else plays), and says
     * what of the one playing is heard; null when none plays. A ceiling reached when it may not passes unsaid.
     */
    tick(now: number, may: boolean): Heard | null {
      const p = plan
      if (!playing && p && now >= p.due) {
        plan = null
        const clip = may ? pick(p.settings) : null
        if (clip) {
          const playback = deps.createPlayback()
          playback.enqueue(0, clip.audio.slice(0))
          playback.finish()
          playing = { playback, text: clip.text }
          said = [clip.text, ...said].slice(0, Math.max(1, p.settings.recent))
        }
      }
      if (!playing) return null
      const { playback, text } = playing
      const audio = playback.heardAudio?.() ?? new Int16Array(0)
      if (!playback.idle()) return { text, playing: true, audio }
      stop()
      return { text, playing: false, audio }
    },
  }
}

export type StandardAcknowledgement = ReturnType<typeof createStandardAcknowledgement>
