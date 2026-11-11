/**
 * The short sounds of a call, made in the browser like the raised hand's chime (playback.ts): voice on and off, mute
 * and unmute, the connection lost. Each is under a quarter of a second and well below speech, and none plays while
 * the agent's voice does. Rising means on, falling means off.
 */
import type { VoiceSnapshot } from './voiceSnapshot'

export type VoiceSound = 'on' | 'off' | 'mute' | 'unmute' | 'lost'

type Note = { hz: number; at: number; secs: number; wave: OscillatorType; peak: number }

const NOTES: Record<VoiceSound, Note[]> = {
  on: [{ hz: 659, at: 0, secs: 0.14, wave: 'triangle', peak: 0.07 }, { hz: 880, at: 0.09, secs: 0.18, wave: 'triangle', peak: 0.07 }],
  off: [{ hz: 880, at: 0, secs: 0.14, wave: 'triangle', peak: 0.07 }, { hz: 659, at: 0.09, secs: 0.2, wave: 'triangle', peak: 0.07 }],
  mute: [{ hz: 587, at: 0, secs: 0.08, wave: 'sine', peak: 0.06 }, { hz: 440, at: 0.07, secs: 0.12, wave: 'sine', peak: 0.06 }],
  unmute: [{ hz: 440, at: 0, secs: 0.08, wave: 'sine', peak: 0.06 }, { hz: 587, at: 0.07, secs: 0.12, wave: 'sine', peak: 0.06 }],
  lost: [{ hz: 330, at: 0, secs: 0.3, wave: 'sine', peak: 0.05 }],
}

export function playVoiceSound(sound: VoiceSound, makeContext: () => AudioContext = () => new AudioContext()): void {
  let ctx: AudioContext
  try { ctx = makeContext() } catch { return }
  const start = ctx.currentTime + 0.02
  for (const n of NOTES[sound]) {
    const tone = ctx.createOscillator()
    const gain = ctx.createGain()
    const at = start + n.at
    tone.type = n.wave
    tone.frequency.setValueAtTime(n.hz, at)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(n.peak, at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + n.secs)
    tone.connect(gain)
    gain.connect(ctx.destination)
    tone.start(at)
    tone.stop(at + n.secs + 0.02)
  }
  setTimeout(() => { void ctx.close().catch(() => undefined) }, 800)
}

type Seen = Pick<VoiceSnapshot, 'phase' | 'muted' | 'reconnecting'>

/**
 * The sound a change of the call makes, if any: on, once, when voice first can hear (or hears again after a lost
 * connection); off when it ends; mute and unmute; lost when the connection drops. Nothing while the agent speaks.
 */
export function soundOf(before: Seen, after: Seen): VoiceSound | null {
  if (before.phase !== 'off' && after.phase === 'off') return 'off'
  if (after.phase === 'off' || after.phase === 'speaking') return null
  if (!before.reconnecting && after.reconnecting) return 'lost'
  if (before.reconnecting && !after.reconnecting) return 'on'
  if (before.phase === 'starting' && after.phase !== 'starting') return 'on'
  if (before.muted !== after.muted && before.phase !== 'off') return after.muted ? 'mute' : 'unmute'
  return null
}
