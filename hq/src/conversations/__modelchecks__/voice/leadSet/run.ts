/**
 * The lead's scenario library, run as a model check (plan task 4c.4): each scenario through the same lead path as Live
 * (voice/playground/leads.ts `modelLead`: the lead's real context with the voice turn block and the Adaptive voice
 * switch, keep_listening and the stand-in start_work, the spoken first step's reasoning), read by the lead's voice
 * logic, with no speech. Development calls: the access carries no costing, so nothing reaches a usage report.
 */
import type { ModelAdapter, ResolvedAccess } from '../../../contract'
import type { PlaygroundEntry } from '../../../../shared/voicePlayground'
import { canHold, holdReason, readLeadStep } from '../../../lead/voiceLogic'
import { STARTS_WORK } from '../../../coordinator/startedWords'
import type { PlaygroundTurn } from '../../../voice/playground/context'
import { modelLead, spokenMessageOf } from '../../../voice/playground/leads'
import type { PlaygroundScenario, ScenarioResult } from '../types'
import { scoreStep } from './score'

/** The scenario as one spoken turn: its conversation, then the person's last words, voice on. */
export function scenarioTurn(s: PlaygroundScenario, adaptiveVoice: boolean): PlaygroundTurn {
  const at = (i: number) => Date.UTC(2026, 0, 1, 9) + i * 5_000
  const history: PlaygroundEntry[] = s.conversation.map(([who, text], i) => who === 'person'
    ? { id: `${s.id}-${i}`, role: 'person', text, spoken: true, at: at(i) }
    : { id: `${s.id}-${i}`, role: 'agent', text, state: 'COMPLETED', spoken: true, at: at(i) })
  const last: PlaygroundEntry = { id: `${s.id}-last`, role: 'person', text: s.last, spoken: true, at: at(history.length) }
  return { history: [...history, last], answers: [last], listening: true, trailedOff: false, wentOn: false, adaptiveVoice }
}

export async function runLeadScenario(
  scenario: PlaygroundScenario, model: ModelAdapter, access: ResolvedAccess, opts: { adaptiveVoice?: boolean; signal?: AbortSignal } = {},
): Promise<ScenarioResult> {
  const signal = opts.signal ?? new AbortController().signal
  const turn = scenarioTurn(scenario, opts.adaptiveVoice !== false)
  let text = ''
  let firstAt: number | null = null
  let usage = { inputTokens: 0, outputTokens: 0 }
  const reading = readLeadStep({
    spokenMessage: spokenMessageOf(turn), mayHold: () => canHold([]), replied: () => text, startsWork: STARTS_WORK,
    stream: piece => { text += piece },
    hold: () => undefined,
    finish: e => { usage = { inputTokens: e.usage.inputTokens, outputTokens: e.usage.outputTokens } },
  })
  const started = performance.now()
  let error: string | undefined
  try {
    for await (const event of modelLead(access.model, Promise.resolve(access), { model, cacheKey: `voice-check:${scenario.id}` }).events(turn, signal)) {
      if (signal.aborted) break
      if (firstAt === null && (event.type === 'tool-call' || (event.type === 'text' && event.text.trim()))) firstAt = performance.now()
      reading.take(event)
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  const { held, calls } = reading.result()
  const names = calls.map(c => c.name)
  const score = error ? { pass: false, did: 'failed', wroteFirst: false } : scoreStep(scenario.wanted, { held: held !== null, text, calls: names })
  return {
    scenarioId: scenario.id, model: access.model, ...score, text: text.trim(), reason: held ? holdReason(held) : null, calls: names,
    firstOutputMs: firstAt === null ? null : Math.round(firstAt - started), ...usage, ...(error && { error }),
  }
}
