/**
 * What the voice lab shows, one row per component, as a pure reduction over the runtime's events. Live, the lab
 * folds in each event as it is delivered; for a saved log it folds in the whole log. Every list is bounded.
 */
import type { DetectorSettingsInUse, FloorState, RoomLabel, SttState, TurnAnswer, VoiceEvent } from '../events'

export const TRACE_POINTS = 240
const LIST_LIMIT = 40

export type TracePoint = { t: number; confidence: number }
export type ScoreRow = { t: number; score: number; silenceMs: number }
export type DecisionRow = { t: number; answer: TurnAnswer; confidence: number | null; silenceMs: number; by: 'model' | 'fallback' }
export type PlaybackRow = { t: number; action: 'duck' | 'stop' | 'resume'; replyId: string }
export type FloorRow = { t: number; state: FloorState }
export type WordsRow = { t: number; text: string; committed: boolean }

export type LabState = {
  /** How many events of each kind have been seen: a row with none says "no events yet". */
  seen: Record<string, number>
  silence: { trace: TracePoint[]; silent: boolean | null; detector: DetectorSettingsInUse | null }
  acoustic: { echoLevel: number | null; room: RoomLabel | null }
  stt: { provisional: string; committed: WordsRow[]; lagMs: number | null; queuedMs: number | null; status: SttState | null }
  semantics: { scores: ScoreRow[]; decisions: DecisionRow[] }
  floor: { state: FloorState | null; changes: FloorRow[]; playback: PlaybackRow[] }
}

export function initialLab(detector: DetectorSettingsInUse | null = null): LabState {
  return {
    seen: {},
    silence: { trace: [], silent: null, detector },
    acoustic: { echoLevel: null, room: null },
    stt: { provisional: '', committed: [], lagMs: null, queuedMs: null, status: null },
    semantics: { scores: [], decisions: [] },
    floor: { state: null, changes: [], playback: [] },
  }
}

const keepLast = <T,>(list: readonly T[], item: T, limit: number): T[] => {
  const next = [...list, item]
  return next.length > limit ? next.slice(next.length - limit) : next
}

/** Events the lab does not draw: they would only cost a render each. */
const UNDRAWN = new Set(['audio.frame', 'playback.frame', 'clock.tick'])

export function reduceLab(state: LabState, event: VoiceEvent): LabState {
  if (UNDRAWN.has(event.kind)) return state
  const seen = { ...state.seen, [event.kind]: (state.seen[event.kind] ?? 0) + 1 }
  const next = { ...state, seen }
  switch (event.kind) {
    case 'acoustic.vadScore':
      return { ...next, silence: { ...state.silence, trace: keepLast(state.silence.trace, { t: event.t, confidence: event.confidence }, TRACE_POINTS) } }
    case 'acoustic.silence':
      return { ...next, silence: { ...state.silence, silent: event.silent } }
    case 'acoustic.detector':
      return { ...next, silence: { ...state.silence, detector: event.detector } }
    case 'acoustic.echoLevel':
      return { ...next, acoustic: { ...state.acoustic, echoLevel: event.level } }
    case 'acoustic.room':
      return { ...next, acoustic: { ...state.acoustic, room: event.label } }
    case 'stt.words':
      return {
        ...next,
        stt: event.committed
          ? { ...state.stt, provisional: '', committed: keepLast(state.stt.committed, { t: event.t, text: event.text, committed: true }, LIST_LIMIT) }
          : { ...state.stt, provisional: event.text },
      }
    case 'stt.lag':
      return { ...next, stt: { ...state.stt, lagMs: event.lagMs, queuedMs: event.queuedMs } }
    case 'stt.status':
      return { ...next, stt: { ...state.stt, status: event.state } }
    case 'semantics.score':
      return { ...next, semantics: { ...state.semantics, scores: keepLast(state.semantics.scores, { t: event.t, score: event.score, silenceMs: event.silenceMs }, LIST_LIMIT) } }
    case 'semantics.decision':
      return {
        ...next,
        semantics: {
          ...state.semantics,
          decisions: keepLast(state.semantics.decisions, { t: event.t, answer: event.answer, confidence: event.confidence, silenceMs: event.silenceMs, by: event.by }, LIST_LIMIT),
        },
      }
    case 'orchestration.floor':
      return { ...next, floor: { ...state.floor, state: event.state, changes: keepLast(state.floor.changes, { t: event.t, state: event.state }, LIST_LIMIT) } }
    case 'orchestration.playback':
      return { ...next, floor: { ...state.floor, playback: keepLast(state.floor.playback, { t: event.t, action: event.action, replyId: event.replyId }, LIST_LIMIT) } }
    default:
      return next
  }
}

export function reduceAll(events: readonly VoiceEvent[], detector: DetectorSettingsInUse | null = null): LabState {
  return events.reduce(reduceLab, initialLab(detector))
}

/** The kinds each row listens for: a row none of them has been seen for is "no events yet". */
export const ROW_KINDS = {
  silence: ['acoustic.vadScore', 'acoustic.silence'],
  acoustic: ['acoustic.echoLevel', 'acoustic.room'],
  stt: ['stt.words', 'stt.lag', 'stt.status'],
  semantics: ['semantics.score', 'semantics.decision'],
  floor: ['orchestration.floor', 'orchestration.playback'],
} as const

export function isBuilt(state: LabState, row: keyof typeof ROW_KINDS): boolean {
  return ROW_KINDS[row].some(kind => (state.seen[kind] ?? 0) > 0)
}
