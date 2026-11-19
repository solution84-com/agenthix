/**
 * The voice model checks' own shapes (adaptive voice listening): the light model's scripted set and the lead's scenario
 * library, with what each step wants and what a run records. They were the voice playground's Scenarios mode; the
 * playground is now Live only and these run as model checks (`voice.models.ts`).
 */
import type { VoiceHumTone, VoiceListenMoment } from '@agenthix/core'
import type { ListenerToolName } from '../../voice/listener/tools'

// ── The light model's set ──

/** What one step must come to, as the spec says it should. */
export type LightExpect = {
  /** The choices that pass. */
  choices: readonly ListenerToolName[]
  /** How the turn must end at this step: `open` when it must not end. */
  turn: 'closed' | 'handedOver' | 'fallback' | 'open'
}

export type LightStep = {
  moment: VoiceListenMoment
  /** The message so far this turn; empty for `working`. */
  text: string
  quietMs: number
  workingMs?: number
  keptOpen?: boolean
  expect: LightExpect
}

export type LightScenario = {
  id: string
  /** The moment of the spec it tries. */
  title: string
  /** What the spec says should happen, in a line. */
  wants: string
  exchanges: readonly (readonly ['person' | 'agent', string])[]
  recap: string | null
  steps: readonly LightStep[]
}

export type LightStepResult = {
  choice: ListenerToolName | null
  words: string | null
  answer: string | null
  asked: string | null
  /** The wait hq sent for the next check, from its schedule, in seconds. */
  nextCheck: number | null
  turn: 'closed' | 'handedOver' | 'fallback' | 'open'
  /** The tone the call gave its line, if any (none for calm). */
  tone?: VoiceHumTone | null
  ms: number
  overLimit: boolean
  pass: boolean
  /** Why it failed, in a few words. */
  why: string | null
}

/** A paced scenario's pace across the pause. */
export type PacedSummary = {
  /** The checks within the time, the first included. */
  checks: number
  /** The wait hq sent after each check, in seconds, in order. */
  nextChecks: number[]
  /** The quiet at each check, in milliseconds. */
  quietAtMs: number[]
  /** The quiet at the first `invite`; null when none came. */
  firstInviteAtMs: number | null
  /** The words of each `invite`. */
  invites: string[]
  /**
   * The quiet at the first check that they are still there: an invitation after an earlier one, or one that asks it
   * ("Still with me?"); null when none came.
   */
  firstPresenceAtMs: number | null
  presenceChecks: number
  /** The words of each presence check. */
  presenceLines: string[]
  /** The check at the "not yet" limit, after the pause: what it chose, its words and how the turn ended; null when none ran. */
  atLimit: { choice: ListenerToolName | null; words: string | null; turn: LightStepResult['turn'] } | null
}

export type LightScenarioResult = {
  scenarioId: string
  model: string
  pass: boolean
  steps: LightStepResult[]
  inputTokens: number
  outputTokens: number
  error?: string
  /** A paced scenario's pace, and why it failed when no step did. */
  paced?: PacedSummary
  why?: string
}

// ── The lead's scenario library ──

/**
 * What a scenario wants of the lead: `hold` calls keep_listening; `reply` answers in words; `quick` answers in words
 * with no tool; `task` calls start_work.
 */
export type ScenarioWanted = 'hold' | 'reply' | 'quick' | 'task'

/** One fixed scenario: the conversation so far, oldest first, then the person's last words, spoken. */
export type PlaygroundScenario = {
  id: string
  wanted: ScenarioWanted
  conversation: readonly (readonly ['person' | 'agent', string])[]
  last: string
}

export type ScenarioGroup = { id: ScenarioWanted; title: string; scenarios: readonly PlaygroundScenario[] }

export type ScenarioResult = {
  scenarioId: string
  model: string
  pass: boolean
  /** What it did, in a short word: held, answered, called start_work, called a tool, said nothing, failed. */
  did: string
  /** It held, and wrote words before the call (hq withdraws them). */
  wroteFirst: boolean
  text: string
  /** The reason a keep_listening call gave; null when it did not hold. */
  reason: string | null
  calls: string[]
  /** From the call to its first text or tool call; null when nothing came. */
  firstOutputMs: number | null
  inputTokens: number
  outputTokens: number
  error?: string
}
