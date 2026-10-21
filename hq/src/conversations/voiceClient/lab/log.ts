/**
 * Saving and loading the runtime's event log as JSON, so a session can be looked at afterwards. What the person said
 * is personal data, so a saved log keeps no audio: audio payloads are reduced to their length. Words and scores are
 * kept; they are what the lab shows.
 */
import type { Overflow } from '../runtime/types'
import type { VoiceEvent } from '../events'

export const LOG_FORMAT = 'voice-log'
export const LOG_VERSION = 1

export type SavedOverflow = { loop: string; at: number; droppedKind: string; droppedSeq: number }

export type SavedLog = {
  format: typeof LOG_FORMAT
  version: typeof LOG_VERSION
  savedAt: string
  settingsVersion: number | null
  events: unknown[]
  overflows: SavedOverflow[]
}

export type LoadedLog = { events: VoiceEvent[]; settingsVersion: number | null; overflows: SavedOverflow[] }

const toPlain = (event: VoiceEvent): unknown => {
  switch (event.kind) {
    case 'audio.frame':
    case 'playback.frame':
      return { ...event, pcm: { samples: event.pcm.length } }
    case 'reply.audio':
      return { ...event, pcm24k: { bytes: event.pcm24k.byteLength } }
    default:
      return event
  }
}

export const savedOverflows = (overflows: readonly Overflow[]): SavedOverflow[] =>
  overflows.map(o => ({ loop: o.loop, at: o.at, droppedKind: o.dropped.kind, droppedSeq: o.dropped.seq }))

export function serializeLog(
  events: readonly VoiceEvent[], overflows: readonly Overflow[], settingsVersion: number | null, savedAt = new Date(),
): string {
  const saved: SavedLog = {
    format: LOG_FORMAT,
    version: LOG_VERSION,
    savedAt: savedAt.toISOString(),
    settingsVersion,
    events: events.map(toPlain),
    overflows: savedOverflows(overflows),
  }
  return JSON.stringify(saved)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Throws an Error with words a person can read when the text is not a saved log. */
export function parseLog(text: string): LoadedLog {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('This file is not JSON.') }
  if (!isRecord(raw) || raw.format !== LOG_FORMAT) throw new Error('This file is not a saved voice log.')
  if (raw.version !== LOG_VERSION) throw new Error(`This log is version ${String(raw.version)}; the lab reads version ${LOG_VERSION}.`)
  if (!Array.isArray(raw.events)) throw new Error('This log has no list of events.')
  const events = raw.events.map((e, i) => {
    if (!isRecord(e) || typeof e.kind !== 'string' || typeof e.t !== 'number' || typeof e.seq !== 'number') {
      throw new Error(`Event ${i + 1} in this log is malformed.`)
    }
    return e as unknown as VoiceEvent
  })
  const overflows = Array.isArray(raw.overflows) ? (raw.overflows as SavedOverflow[]) : []
  return { events, settingsVersion: typeof raw.settingsVersion === 'number' ? raw.settingsVersion : null, overflows }
}
