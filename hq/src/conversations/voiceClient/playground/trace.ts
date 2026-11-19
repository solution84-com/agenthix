/**
 * One line of what the page's voice client saw or played, for the server's log, so a person testing in the playground
 * can be helped as they test: the sounds, the holds and sends, the audio model's answers, the floor. Only events that
 * explain a decision, and the words of a turn as sent. Development only; never audio.
 */
import type { VoiceEvent } from '../events'
import { styleWords } from '../pacing/style'
import { paceTitle } from './paceSteps'
import { profileWords } from '../tone/voiceProfile'

/** A reader that numbers time from the first event it sees, and skips a line that repeats the one before (a playing sound reports every frame). */
export function createTraceReader() {
  let base: number | null = null
  let last = ''
  /** The sound playing: it reports every frame, so it is said once, when it starts, whatever comes between. */
  let sound: string | null = null
  /** Every voice profile reading is said, numbered, so how often they come can be judged. */
  let readings = 0
  return (event: VoiceEvent): string | null => {
    if ('t' in event && typeof event.t === 'number') base ??= event.t
    const at = 't' in event && typeof event.t === 'number' ? `${((event.t - (base ?? event.t)) / 1000).toFixed(1)}s ` : ''
    if (event.kind === 'phrase.at') {
      const id = event.lineId ?? event.text
      if (!event.playing) { if (sound === id) sound = null; return null }
      if (sound === id) return null
      sound = id
    }
    const line = event.kind === 'tone.voice'
      ? `${at}voice profile reading ${++readings} (${event.final ? 'final' : 'partial'}): ${profileWords(event) || 'no labels'}`
      : traceLine(event, at)
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
    case 'backchannel.hum': return `${at}backchannel: a ${event.hum} ${event.tone} hum is due${event.fallback ? ` (stood in: ${event.fallback})` : ''} (paused ${(event.pausedMs / 1000).toFixed(1)} s, ${event.notYet ? 'the light model said not yet' : event.inWait ? 'READY held by the false-finish wait' : event.verdict ?? 'no verdict'}, ${(event.speechMs / 1000).toFixed(1)} s of speech${event.reactionSpacing ? ', enough for a reaction' : ''}${event.reactionHeld ? '; the reaction held over a plainer answer' : ''}${event.laugh ? '; a laugh back: your voice laughed' : ''})`
    case 'backchannel.miss': return `${at}backchannel: no hum: ${event.why}`
    case 'hum.held': return `${at}hum service${event.atPause ? ' (asked as the pause began)' : ''}: ${event.humKind ?? 'no answer'}${event.tone ? ` ${event.tone}` : ''}${event.fallback ? ` (${event.fallback})` : ''} in ${(event.ms / 1000).toFixed(2)} s`
    case 'hum.speak': return `${at}sound keeper: asked for ${event.hum} sounds in a ${event.tone} tone${event.warm ? ' (warming)' : ''}`
    case 'hum.sound': return `${at}sound keeper: "${event.words}" ${event.tone} ${event.ok ? (event.made === 'new' ? 'made new' : 'already made') : 'could not be made'}`
    case 'backchannel.sound': return `${at}sound keeper: "${event.words}" ${event.tone}, ${event.made === 'new' ? 'made new' : 'already made'}`
    case 'backchannel.unplayed': return `${at}sound keeper: no sound: ${event.why}`
    case 'hum.dropped': return `${at}hum service: an answer${event.atPause ? ' to the pause\'s question' : ''} dropped, ${(event.waitedMs / 1000).toFixed(2)} s after its question`
    case 'backchannel.played': return event.text === null ? `${at}backchannel: no hum played: ${event.why ?? 'none stored'}` : null
    case 'tone.hint': return `${at}voice hint: ${event.hint ?? 'none'}`
    case 'listen.styleAsked': return `${at}the reply set the listening style: ${event.style}`
    case 'reply.held': return `${at}the lead held the turn`
    case 'listen.drop': return `${at}light model's line dropped, never heard: ${event.why}`
    case 'orchestration.falseFinish': return `${at}false finish ${event.count} this turn: you went on ${(event.afterMs / 1000).toFixed(1)} s after the send; READY now waits for ${(event.waitMs / 1000).toFixed(1)} s of quiet`
    case 'orchestration.finishHeld': return `${at}sound model's finish held: false finishes this turn ask for ${(event.waitMs / 1000).toFixed(1)} s of quiet`
    case 'orchestration.pace': return `${at}pace: ${paceTitle(event.heard, event.learned)}`
    case 'listen.style': return `${at}listening style${event.restored ? ', held from earlier' : event.asked ? ` (${event.asked})` : ''}: ${styleWords(event.state)}`
    case 'orchestration.ready': return event.waitedMs !== undefined ? `${at}sound model's finish counted after ${(event.waitedMs / 1000).toFixed(1)} s of quiet` : null
    case 'orchestration.send': return `${at}turn sent${event.append ? ' (joining the held run)' : ''}: ${event.text.trim().slice(0, 200)}`
    case 'semantics.decision': return `${at}audio model: ${event.answer} ${event.confidence === null ? '-' : event.confidence.toFixed(2)} after ${event.silenceMs} ms`
    case 'orchestration.floor': return `${at}floor: ${event.state}`
    case 'acoustic.silence': return `${at}${event.silent ? 'silent' : 'speaking'}`
    case 'orchestration.playback': return `${at}playback ${event.action}${'by' in event && event.by ? ` by ${event.by}` : ''}`
    default: return null
  }
}
