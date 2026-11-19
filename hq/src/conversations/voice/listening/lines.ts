/**
 * The light model's lines as speech (adaptive voice listening, spec §How its words are played; plan task 3.10): each
 * line made on a path of its own, apart from the reply's sentences (session.ts), so a line never waits behind a reply
 * and a reply never waits behind a line in hq; the browser plays each to its end. A line goes in parts as its speech
 * streams in (lineParts.ts), so it starts playing before it is all made; it is made plainly, in the agent's ordinary
 * voice as its replies are — the stored phrases' relaxed direction made a seven-word hold play for four to six seconds,
 * and the reply waits for it — without the silence the speech service leaves after it, and costed like the reply's
 * speech. A stored phrase (the fallback's hold, the "not yet" limit's closing line) keeps its direction and comes whole from the disk cache (phrases.ts).
 */
import { randomUUID } from 'node:crypto'
import { CONVERSATION_VOICE_SOCKET as V, type VoiceLineEvent } from '@agenthix/core'
import { inworldTtsAdapter } from '../../../voice/inworldAdapter'
import { recordTts } from '../../../billing/sources/voice'
import { reported } from '../reportedSpeech'
import { spokenAs, storedPhraseClip, type StoredPool } from '../phrases'
import type { AgentVoice } from '../speech'
import { lineParts } from './lineParts'

export interface LineDeps {
  /** The line as audio, 24 kHz PCM16, as it streams from the speech service. */
  synthesize(text: string, voice: AgentVoice): AsyncIterable<Buffer>
  stored(voice: AgentVoice, avoid: readonly string[], pool: StoredPool): Promise<{ text: string; audio: Buffer } | null>
  toHolder(event: string, payload: VoiceLineEvent): void
  /** A line that could not be made: not heard, unless part of it was sent (`partly`), which plays and ends there. */
  failed(lineId: string, err: unknown, partly: boolean): void
}

async function* streamedLine(text: string, voice: AgentVoice, conversationId: string): AsyncIterable<Buffer> {
  const costed = voice.costed
  for await (const { audio } of reported(voice.providerId, inworldTtsAdapter.synthesizeStream(text, voice),
    costed ? () => recordTts(costed, text.length, { conversationId }) : undefined)) yield Buffer.from(audio)
}

export function lineDeps(conversationId: string, toHolder: LineDeps['toHolder'], failed: LineDeps['failed']): LineDeps {
  return {
    synthesize: (text, voice) => streamedLine(text, voice, conversationId),
    stored: (voice, avoid, pool) => storedPhraseClip(voice, pool, avoid),
    toHolder,
    failed,
  }
}

/**
 * Speaks a line: its id at once, its audio as `line` parts as it is made, the last marked `end`. `steering`: the turn
 * tone's (`../toneSteering`), sent to the speech service only, on a model that takes it; the line's words stay as written.
 */
export function speakLine(conversationId: string, voice: AgentVoice, text: string, deps: LineDeps, steering: string | null = null): string {
  const lineId = randomUUID()
  const parts = lineParts()
  let index = 0
  const send = (audio: Buffer, end: boolean) =>
    deps.toHolder(V.line, { conversationId, lineId, text, audio, index: index++, ...(end && { end: true as const }) })
  void (async () => {
    for await (const piece of deps.synthesize(steering ? spokenAs(text, voice, steering) : text, voice)) {
      const part = parts.take(piece)
      if (part) send(part, false)
    }
    const last = parts.end()
    if (!parts.sent && last.byteLength === 0) throw new Error('The speech service made no audio')
    send(last, true)
  })().catch(err => {
    // What was sent plays, and ends there.
    if (parts.sent) send(Buffer.alloc(0), true)
    deps.failed(lineId, err, parts.sent)
  })
  return lineId
}

/** Plays a stored phrase of `pool` none of `avoid` repeats; its id and words, or null when none could be made. */
export async function speakStored(
  conversationId: string, voice: AgentVoice, avoid: readonly string[], deps: LineDeps, pool: StoredPool = 'hold',
): Promise<{ lineId: string; text: string } | null> {
  const clip = await deps.stored(voice, avoid, pool).catch(() => null)
  if (!clip) return null
  const lineId = randomUUID()
  deps.toHolder(V.line, { conversationId, lineId, text: clip.text, audio: clip.audio, stored: true })
  return { lineId, text: clip.text }
}
