/**
 * The reply's tone tag (adaptive voice listening, spec §The heavy model → *Its tone*): with Tone on, the voice turn
 * block asks a spoken reply to start with `[tone: …]`, one of the six tones. It is read and taken out here, as a step's
 * text streams, so it never reaches the speech, the chat or the record: the tag may come split across pieces, so the
 * start of a step's text is held until it is plainly a tag or plainly not one. A tag naming no tone hq knows is still
 * taken out, and is calm; a bare `[warm]` counts as a tag too. Anything else starting with a bracket goes on as written.
 */
import { VOICE_HUM_TONES, type VoiceHumTone } from '@agenthix/core'

/** The longest a tag may be: past this, what was held is not a tag and goes on. */
export const TONE_TAG_MAX_CHARS = 40

/** What a tag-to-be may look like before its `]`: a bracket, a word, and after `tone:` anything. */
const COULD_BE_TAG = /^\[\s*[a-z]*\s*(?::[^\]]*)?$/i

function toneNamed(word: string): VoiceHumTone | null {
  const w = word.trim().toLowerCase()
  return (VOICE_HUM_TONES as readonly string[]).includes(w) ? w as VoiceHumTone : null
}

/** A complete tag's tone: `calm` for a `[tone: …]` naming none hq knows; null when it is not a tag at all. */
export function tagTone(tag: string): VoiceHumTone | null {
  const inner = tag.slice(1, -1)
  const named = inner.match(/^\s*tone\s*:(.*)$/i)
  if (named) return toneNamed(named[1]!) ?? 'calm'
  return toneNamed(inner)
}

export interface ToneTagReader {
  /** One piece of the step's text: what of it goes on now, possibly nothing while the start is held. */
  take(piece: string): string
  /** The step's text ended: what was held and is not a tag goes on; a tag cut short is dropped. */
  flush(): string
}

/** Reads the start of one step's text; `read` hears the tone of a tag found there. */
export function toneTagReader(read: (tone: VoiceHumTone) => void): ToneTagReader {
  let held = ''
  /** `start`: the start is held; `after`: a tag was taken, so the space after it is too; `done`: all goes on. */
  let phase: 'start' | 'after' | 'done' = 'start'

  function decide(): string {
    const rest = held.trimStart()
    if (rest === '') return ''
    const close = rest.indexOf(']')
    if (rest[0] !== '[' || (close === -1 && (rest.length > TONE_TAG_MAX_CHARS || !COULD_BE_TAG.test(rest)))) return release()
    if (close === -1) return ''
    const tone = close < TONE_TAG_MAX_CHARS ? tagTone(rest.slice(0, close + 1)) : null
    if (!tone) return release()
    read(tone)
    held = ''
    phase = 'after'
    return after(rest.slice(close + 1))
  }

  function release(): string {
    const out = held
    held = ''
    phase = 'done'
    return out
  }

  function after(piece: string): string {
    const out = piece.trimStart()
    if (out !== '') phase = 'done'
    return out
  }

  return {
    take(piece) {
      if (phase === 'done') return piece
      if (phase === 'after') return after(piece)
      held += piece
      return decide()
    },
    flush() {
      if (phase !== 'start') return ''
      const rest = held.trimStart()
      phase = 'done'
      held = ''
      // A start that could still have become a tag is dropped: its bracket would be spoken.
      return rest === '' || COULD_BE_TAG.test(rest) ? '' : rest
    },
  }
}
