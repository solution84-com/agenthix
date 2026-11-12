import { config } from 'wasp/client'
import type { ClipPlay } from './demoVoiceSession'

/** A recorded demo line, played by the browser from hq's clip route (`demo/voice/clip.ts`). */
export function playClipInBrowser(clip: string): ClipPlay {
  const audio = new Audio(`${config.apiUrl}/api/demo/voice/${encodeURIComponent(clip)}`)
  let settle: () => void = () => undefined
  const ended = new Promise<void>(resolve => { settle = resolve })
  audio.addEventListener('ended', settle)
  // A clip that cannot play (blocked, missing) ends the turn's speech at once; its text is already in the thread.
  audio.addEventListener('error', settle)
  audio.play().catch(settle)
  // Its length, so the reply's text can be paced to it; null when the clip cannot be read.
  const duration = new Promise<number | null>(resolve => {
    const known = () => resolve(Number.isFinite(audio.duration) ? audio.duration : null)
    if (audio.readyState >= 1) known()
    else audio.addEventListener('loadedmetadata', known)
    audio.addEventListener('error', () => resolve(null))
  })
  return {
    ended,
    duration,
    stop: () => { audio.pause(); settle() },
    mute: (muted) => { audio.muted = muted },
  }
}
