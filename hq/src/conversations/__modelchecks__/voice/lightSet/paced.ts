/**
 * The light model's paced scenarios: a turn the person leaves open, then silence, checked again at the waits hq sends
 * from its own schedule (5, 15 and 30 s of quiet, then the limit), as the browser would. What is scored is what the
 * light model chose across the pause — whether and when it invites, the one presence check, the limit's line — not
 * one step. Run through hq's own listening call.
 */
import type { ModelAdapter, ResolvedAccess } from '../../../contract'
import { listenerSettingsWith, type ListenerSettings } from '../../../voice/listener'
import type { LightScenario, LightScenarioResult, LightStep, LightStepResult, PacedSummary } from '../types'
import { runLightScenario } from './run'

const NOT_YET = ['keep_listening', 'acknowledge', 'invite'] as const

export type PacedExpect = {
  /** The fewest and most checks within the time, the first one included. */
  checks: readonly [number, number]
  /** At least one `invite` by this quiet, in milliseconds. */
  invitesBy?: number
  /** No `invite` before this quiet, in milliseconds: they asked for time. */
  noInviteBefore?: number
  /** Exactly one presence check, at the last check before the limit, after an earlier invitation. */
  presence?: boolean
  /** Checked at the "not yet" limit after the pause, the turn closes with the light model's own `close_turn` line. */
  closesAtLimit?: boolean
  /** Words no line may hold: a guess at what they were about to say. */
  neverGuesses?: RegExp
}

export type PacedScenario = Omit<LightScenario, 'steps'> & {
  /** The message they left, the same at every check. */
  text: string
  /** The quiet when the turn sounded finished, in milliseconds. */
  firstQuietMs: number
  /** How long the silence is checked, in milliseconds. */
  untilMs: number
  expect: PacedExpect
}

export const PACED_SCENARIOS: readonly PacedScenario[] = Object.freeze([
  {
    id: 'trailing-off', title: 'Trailing off, then silence', wants: 'Keeps listening at first; invites them to go on by 15 s; at the last check, once, checks they are still there; at the limit, its own closing line.',
    exchanges: [['agent', 'What did you want to sort out?']], recap: null,
    text: 'I was thinking we could maybe move the meeting to', firstQuietMs: 700, untilMs: 40_000,
    expect: {
      checks: [4, 4], invitesBy: 15_000, presence: true, closesAtLimit: true,
      neverGuesses: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|next week|\d+ ?(am|pm|o'clock))\b/i,
    },
  },
  {
    id: 'find-the-number', title: '"Give me a minute, I need to find the number"', wants: 'Never closes the turn before the limit, and no invitation in the first seconds.',
    exchanges: [['agent', 'Which booking was it?']], recap: 'The person is asking about a booking; the agent asked which one.',
    text: 'Give me a minute, I need to find the number.', firstQuietMs: 700, untilMs: 40_000,
    expect: { checks: [4, 4], noInviteBefore: 10_000 },
  },
] satisfies PacedScenario[])

/** A check that they are still there by its words; an invitation after an earlier one is one too, whatever its words. */
export const PRESENCE_CHECK = /\b(still there|still with me|still around|you there|are you there)\b/i
/**
 * What the light model cannot know and must never say: that something went wrong with the line, or a question about
 * how they are.
 */
export const NEVER_SAID = /\b(cut off|cut out|lost you|lose you|dropped|connection|went wrong|you okay|you ok|you alright|you all right|are you well|everything (ok|okay|alright|all right))\b/i
/** How near a check's time a line counts as at that check, in milliseconds: a check comes at its time or just after. */
const AT_CHECK_MS = 1000

/** The pace across the pause, scored against what the scenario wants; null when it passes. */
export function scorePace(expect: PacedExpect, steps: readonly LightStepResult[], summary: PacedSummary, lastCheckMs: number): string | null {
  const ended = steps.find(s => s.turn !== 'open')
  if (ended) return `the turn ended (${ended.turn}, chose ${ended.choice ?? 'nothing'})`
  const failed = steps.find(s => !s.pass)
  if (failed) return failed.why
  const said = [...steps.map(s => s.words), summary.atLimit?.words ?? null].filter((w): w is string => w !== null)
  const wrong = said.find(w => NEVER_SAID.test(w))
  if (wrong) return `said what it cannot know: "${wrong}"`
  const guess = expect.neverGuesses && said.find(w => expect.neverGuesses!.test(w))
  if (guess) return `guessed at the answer: "${guess}"`
  if (summary.presenceChecks > 1) return `${summary.presenceChecks} presence checks; at most 1`
  const presenceAt = summary.firstPresenceAtMs
  if (expect.presence && presenceAt !== null && presenceAt < lastCheckMs - AT_CHECK_MS) {
    return `a presence check at ${presenceAt / 1000} s; wanted it at the last check, ${lastCheckMs / 1000} s`
  }
  const [lo, hi] = expect.checks
  if (summary.checks < lo || summary.checks > hi) return `${summary.checks} checks; wanted ${lo} to ${hi}`
  const invite = summary.firstInviteAtMs
  if (expect.invitesBy !== undefined && (invite === null || invite > expect.invitesBy + AT_CHECK_MS)) {
    return invite === null ? 'never invited' : `first invite at ${invite / 1000} s; wanted one by ${expect.invitesBy / 1000} s`
  }
  if (expect.noInviteBefore !== undefined && invite !== null && invite < expect.noInviteBefore) {
    return `invited at ${invite / 1000} s; wanted none before ${expect.noInviteBefore / 1000} s`
  }
  if (expect.presence) {
    if (presenceAt === null) return 'no presence check'
    if (invite === null || invite >= presenceAt) return 'a presence check with no invitation before it'
  }
  if (expect.closesAtLimit) {
    const end = summary.atLimit
    if (!end) return 'not checked at the limit'
    if (end.turn !== 'closed') return `at the limit the turn was ${end.turn}; wanted closed`
    if (end.choice !== 'close_turn') return `at the limit chose ${end.choice ?? 'nothing'} (a stored closing line); wanted its own close_turn`
  }
  return null
}

/**
 * One paced scenario: the turn sounds finished, then each check comes at the wait hq sent, counted from when the answer
 * came, as the browser counts it, until the time is up or the turn ends. A step passes when the turn stays open with a
 * "not yet" choice.
 */
export async function runPacedScenario(
  scenario: PacedScenario, model: Pick<ModelAdapter, 'complete'>, access: ResolvedAccess,
  settings: ListenerSettings = listenerSettingsWith({}), signal: AbortSignal = new AbortController().signal,
): Promise<LightScenarioResult> {
  const expect = { choices: NOT_YET, turn: 'open' as const }
  const first: LightStep = { moment: 'soundsFinished', text: scenario.text, quietMs: scenario.firstQuietMs, expect }
  const quietAt = [first.quietMs]
  let paceSteps: number | null = null
  let askedAt = Date.now()
  // Each later step comes at the wait hq sent, on the same session; then, if asked, one at the limit.
  const result = await runLightScenario({ ...scenario, steps: [first] }, model, access, settings, signal, {
    next(done) {
      if (paceSteps !== null) return null
      const last = done.at(-1)!
      // The wait counts from the answer's arrival: the call's own time is quiet too.
      const quietMs = quietAt.at(-1)! + (Date.now() - askedAt) + (last.nextCheck ?? settings.schedule.quietFirst) * 1000
      askedAt = Date.now()
      if (last.turn === 'open' && last.choice !== null && quietMs < scenario.untilMs) {
        quietAt.push(quietMs)
        return { moment: 'quiet', keptOpen: true, text: scenario.text, quietMs, expect }
      }
      paceSteps = done.length
      if (!scenario.expect.closesAtLimit || last.turn !== 'open') return null
      return { moment: 'quiet', keptOpen: true, text: scenario.text, quietMs: settings.notYetMaxSilenceMs, expect: { choices: ['close_turn'], turn: 'closed' } }
    },
  })
  const pace = result.steps.slice(0, paceSteps ?? result.steps.length)
  const limit = paceSteps !== null ? result.steps[paceSteps] : undefined
  const firstInvite = pace.findIndex(s => s.choice === 'invite')
  // A presence check asks it in words ("Still with me?"); the first invitation after an earlier one is one too, in
  // whatever words ("You were saying something about the budget?"). A later reassurance is not.
  const asks = (s: LightStepResult) => s.choice === 'invite' && s.words !== null && PRESENCE_CHECK.test(s.words)
  const secondInvite = pace.findIndex((s, i) => s.choice === 'invite' && i > firstInvite && firstInvite >= 0)
  const presences = pace.flatMap((s, i) => (asks(s) || i === secondInvite ? [i] : []))
  const paced: PacedSummary = {
    checks: pace.length,
    nextChecks: pace.map(s => s.nextCheck ?? 0),
    quietAtMs: quietAt.slice(0, pace.length),
    firstInviteAtMs: firstInvite < 0 ? null : quietAt[firstInvite]!,
    invites: pace.filter(s => s.choice === 'invite').map(s => s.words ?? ''),
    firstPresenceAtMs: presences.length ? quietAt[presences[0]!]! : null,
    presenceChecks: presences.length,
    presenceLines: presences.map(i => pace[i]!.words ?? ''),
    atLimit: limit ? { choice: limit.choice, words: limit.words, turn: limit.turn } : null,
  }
  const why = result.error ? null : scorePace(scenario.expect, pace, paced, settings.schedule.quietThird * 1000)
  return { ...result, pass: !result.error && why === null, paced, ...(why ? { why } : {}) }
}
