/**
 * One line of what the page's voice client saw or played, for the server's log, so a person testing in the playground
 * can be helped as they test: the sounds, the holds and sends, the audio model's answers, the floor. Only events that
 * explain a decision, and the words of a turn as sent. Development only; never audio.
 */
import type { VoiceEvent } from '../events'

/** A reader that numbers time from the first event it sees, and skips a line that repeats the one before (a playing sound reports every frame). */
export function createTraceReader() {
  let base: number | null = null
  let last = ''
  return (event: VoiceEvent): string | null => {
    if ('t' in event && typeof event.t === 'number') base ??= event.t
    const at = 't' in event && typeof event.t === 'number' ? `${((event.t - (base ?? event.t)) / 1000).toFixed(1)}s ` : ''
    const line = traceLine(event, at)
    if (line === null) return null
    const body = line.slice(at.length)
    if (body === last) return null
    last = body
    return line
  }
}

function traceLine(event: VoiceEvent, at: string): string | null {
  switch (event.kind) {
    case 'orchestration.phrase': return `${at}asked for a sound: ${event.tiers.join('/')}`
    case 'phrase.at': return event.playing ? `${at}sound playing: ${event.text}` : null
    case 'phrase.skipped': return `${at}no sound played: ${event.why}`
    case 'reply.held': return `${at}the lead held the turn`
    case 'orchestration.send': return `${at}turn sent${event.append ? ' (joining the held run)' : ''}: ${event.text.trim().slice(0, 200)}`
    case 'semantics.decision': return `${at}audio model: ${event.answer} ${event.confidence === null ? '-' : event.confidence.toFixed(2)} after ${event.silenceMs} ms`
    case 'orchestration.floor': return `${at}floor: ${event.state}`
    case 'acoustic.silence': return `${at}${event.silent ? 'silent' : 'speaking'}`
    case 'orchestration.playback': return `${at}playback ${event.action}${'by' in event && event.by ? ` by ${event.by}` : ''}`
    default: return null
  }
}
