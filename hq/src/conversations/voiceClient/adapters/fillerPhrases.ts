/**
 * The filler phrases (adaptive voice spec, Orchestration: the filler phrases): while a reply is awaited, the agent
 * says it heard, in its own voice, and keeps saying a little more the longer the wait, less often as it goes: a short
 * sound the moment the message goes ("Mm."), a mix of an opening and an ending at 3 and 7 s ("Sure, bear with me."),
 * then a longer one at 15 s, repeating every 16 s until the reply comes. hq sends the phrases as voice starts; until
 * then, or without them, there are none. A step with none of its own says one of the step before.
 *
 * None of the last few said is said again while another can be, never while the person holds the floor, and never
 * closer than `gapMs` after the last. The reply that arrives while one plays waits for it to end; the person
 * speaking stops it. None is part of any reply: nothing of them is written into the conversation. A message sent as
 * the person trailed off gets none but the long wait's: its reply is most likely an encouragement response.
 */
import type { Playback } from '../playback'
import type { VoiceSettings } from '../settings'

/** `tier`: which step of the wait the phrase is for, the shortest first. */
export type FillerClip = { text: string; audio: ArrayBuffer; tier: number }

export type Heard = {
  /** The phrase being heard now, or that has just ended. */
  text: string
  playing: boolean
  /** What went to the speaker since the last tick, at 16 kHz. */
  audio: Int16Array
}

type FillerSettings = VoiceSettings['filler']

export function createFillerPhrases(deps: { createPlayback: () => Playback; random?: () => number }) {
  const random = deps.random ?? Math.random
  let clips: FillerClip[] = []
  /** The phrases said last, the latest first. */
  let said: string[] = []
  /** The wait being filled: when the message went, the next step, and when it is due. Null when none is. */
  let plan: { sentAt: number; step: number; due: number; settings: FillerSettings } | null = null
  let playing: { playback: Playback; text: string } | null = null

  /** A phrase for `tier`, or the nearest shorter one that has any: none of the last `recent` said if it can be, never the last. */
  const pick = (tier: number, recent: number): FillerClip | null => {
    for (let t = tier; t >= 0; t--) {
      const ofTier = clips.filter(c => c.tier === t && c.text !== said[0])
      const fresh = ofTier.filter(c => !said.slice(0, recent).includes(c.text))
      const choices = fresh.length ? fresh : ofTier
      if (choices.length) return choices[Math.floor(random() * choices.length)]!
    }
    return null
  }

  /** The step after `step` is due at its time, and at the earliest `gapMs` after `from`. */
  const next = (p: NonNullable<typeof plan>, from: number) => {
    const { steps, repeatEveryMs, gapMs } = p.settings
    const step = p.step + 1
    const at = step < steps.length ? p.sentAt + steps[step]!.afterMs : p.due + repeatEveryMs
    plan = { ...p, step, due: Math.max(at, from + gapMs) }
  }

  const stop = () => {
    playing?.playback.close()
    playing = null
  }

  return {
    add(clip: FillerClip) { clips = [...clips, clip] },
    clear() { clips = []; said = [] },
    /**
     * A message went at `at`: the wait is filled until the reply begins. `trailedOff`: the person seemed mid-thought,
     * and the reply is most likely an encouragement response; "let me think" before it would be wrong, so only a long wait
     * is filled, from its last step.
     */
    arm(at: number, settings: FillerSettings, trailedOff = false) {
      if (settings.steps.length === 0) return
      const step = trailedOff ? settings.steps.length - 1 : 0
      plan = { sentAt: at, step, due: at + settings.steps[step]!.afterMs, settings }
    },
    /** The reply began, or will not come: nothing more is said, and one playing finishes. */
    disarm() { plan = null },
    /** The person spoke, the reply was stopped, or voice ended: nothing more, and one playing stops at once. */
    cancel(): string | null {
      plan = null
      const text = playing?.text ?? null
      stop()
      return text
    },
    /** A phrase is playing. */
    busy: () => playing !== null,
    /**
     * On each tick: starts the next phrase when it is due and `may` (the floor is free, nothing else plays), and says
     * what of the one playing is heard; null when none plays. A step that falls due when it may not is skipped.
     */
    tick(now: number, may: boolean): Heard | null {
      const p = plan
      if (!playing && p && now >= p.due) {
        const clip = may ? pick(Math.min(p.step, p.settings.steps.length - 1), p.settings.recent) : null
        next(p, now)
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
      // The next is never closer than the gap after this one ends.
      if (plan) plan = { ...plan, due: Math.max(plan.due, now + plan.settings.gapMs) }
      return { text, playing: false, audio }
    },
  }
}

export type FillerPhrases = ReturnType<typeof createFillerPhrases>
