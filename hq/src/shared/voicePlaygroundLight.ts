/**
 * The voice playground's light model (adaptive voice listening, plan tasks 5.1–5.3): what the page and the playground's
 * server side say to each other about it, beside `voicePlayground.ts`. Development only, like the rest of the
 * playground; not part of the client protocol.
 *
 * Live: the page sends its light model settings (`config`); the server runs hq's own listening call on them and tells
 * the page each call, each turn's outcome, each recap and each line played. `answer` and `why` travel here, to the playground's
 * own socket, and nowhere else.
 */
import type { VoiceHumTone, VoiceListenMoment } from '@agenthix/core'
import type { ListenerSettingsChange } from '../conversations/voice/listener/settings'
import type { ListenerToolName } from '../conversations/voice/listener/tools'
import type { PlaygroundLead } from './voicePlayground'
import type { SteeringChanges } from '../conversations/voiceClient/backchannel/kinds'

const PREFIX = 'voicePlayground:light.'

export const LIGHT_SOCKET = {
  /** Page → server: the light model's switch, model and settings, and who answers a handed-over message. */
  config: `${PREFIX}config`,
  /** Server → page: one listening call (`LightCallRow`). */
  call: `${PREFIX}call`,
  /** Server → page: how a turn ended, or that it stayed open (`LightTurnRow`). */
  turn: `${PREFIX}turn`,
  /** Server → page: the recap written after a reply (`LightRecapRow`). */
  recap: `${PREFIX}recap`,
  /** Server → page: a line played to its end in the browser (`LightLineRow`). */
  line: `${PREFIX}line`,
} as const

/** The value the light model picker gives for hq's own choice: the listener's short list of fast models. */
export const HQ_LISTENER_CHOICE = 'hq-listener-choice'

/**
 * How the light model's own lines are spoken: `plain`, in the agent's ordinary voice, as its replies (hq's way); or
 * `stored`, with the stored phrases' direction, as they were made before — longer, so a reply after them waits longer.
 */
export type LineDirection = 'plain' | 'stored'

export type PlaygroundLightConfig = {
  /**
   * The flag `voiceListener`: the page always sends true, since Adaptive voice is the light model (`adaptiveVoice` says
   * whether it listens). Kept so the server reads the flag as before.
   */
  on: boolean
  /** The light model, as the model picker names it; null for hq's own choice. */
  model: string | null
  /** Every cap and first value the page changed (`listenerSettingsWith` holds each within its limits). */
  settings: ListenerSettingsChange
  /** Who answers a handed-over message, as in a typed one. */
  lead: PlaygroundLead
  adaptiveVoice: boolean
  lineDirection: LineDirection
  /** The hum service's model, as the model picker names it; null for hq's own choice (purpose `backchannel`). */
  humModel?: string | null
  /** The tones' sound steering as this page changed it ("Hear the sounds"): what new sounds are made with on this page. */
  humSteering?: SteeringChanges
}

/** One listening call, as the Log shows it. `answer` and `why` exist only here. */
export type LightCallRow = {
  id: string
  seq: number
  /** `limit`: hq's own call at the "not yet" limit, after an invitation nobody answered, for its closing line. */
  moment: VoiceListenMoment | 'limit'
  keptOpen: boolean
  quietMs: number
  workingMs: number | null
  /** The message so far this turn, whole; the page shortens it. */
  message: string
  /** What it chose, after the rules; null when no answer came. */
  choice: ListenerToolName | null
  /** The words it plays: a line, or `hand_over`'s hold. */
  words: string | null
  answer: string | null
  /** The answer ran over its word cap and was cut to it. */
  answerCut?: boolean
  /** The reason it gave, when the call asked for one: the page's "Light model gives its reason". Only here, like `answer`. */
  why: string | null
  /** The call asked for a reason, so its timing is not production's. */
  withReason: boolean
  asked: string | null
  nextCheck: number | null
  /** A rule turned its answer into `keep_listening`: which. */
  dropped: string | null
  /** The words a cap dropped, when the rule was the word cap. */
  droppedWords?: string | null
  /** The tone its line is spoken in, as the call named it; absent for calm. */
  tone?: VoiceHumTone
  ms: number
  /** A newer call had begun when its answer came. */
  stale: boolean
  /** No answer within its time limit. */
  overLimit: boolean
  /** A newer call stopped it. */
  superseded: boolean
  failed: boolean
  inputTokens: number
  outputTokens: number
  at: number
}

/** `limitClosed`: closed at the "not yet" limit with a stored closing line, the light model having given none. */
export type LightTurnOutcome = 'closed' | 'handedOver' | 'notYet' | 'fallback' | 'off' | 'limitClosed'

export type LightTurnRow = {
  id: string
  /** The call that decided it; null for the "not yet" bound's own timer. */
  seq: number | null
  outcome: LightTurnOutcome
  /** The words that played: its own line, or the stored hold phrase (or closing line) hq played. */
  say: string | null
  at: number
}

export type LightRecapRow = { id: string; text: string | null; ms: number; error?: string; at: number }

export type LightLineRow = { id: string; lineId: string; text: string; stored: boolean; at: number }
