/**
 * The light model's scripted set, run as a model check (adaptive voice listening, plan task 5.4): each scenario's steps
 * in order through hq's own listening call (`recordedListening` over `createListening`) and a real model, with no
 * audio — a line is only an id, a hand over and a closed turn are only noted. Each step is scored against what the spec
 * says. Development calls: no costing, no ledger.
 */
import type { ModelAdapter, ResolvedAccess } from '../../../contract'
import type { LightCallRow, LightTurnRow } from '../../../../shared/voicePlaygroundLight'
import { listenerSettingsWith, type ListenerSettings } from '../../../voice/listener'
import type { ListeningDeps, ListeningSession } from '../../../voice/listening/listen'
import { PLAYGROUND_AGENT, PLAYGROUND_PERSON } from '../../../voice/playground/light/names'
import { recordedListening } from '../../../voice/playground/light/recorder'
import type { LightScenario, LightScenarioResult, LightStep, LightStepResult } from '../types'
import { scoreLightStep } from './score'

/** After a scenario's own steps, the next step from what came so far; null to stop. */
export interface StepPace { next(done: readonly LightStepResult[]): LightStep | null }

/** One scenario on one model, its steps in order, then any `pace` gives; a failure to reach the model fails it whole. */
export async function runLightScenario(
  scenario: LightScenario, model: Pick<ModelAdapter, 'complete'>, access: ResolvedAccess,
  settings: ListenerSettings = listenerSettingsWith({}), signal: AbortSignal = new AbortController().signal,
  pace?: StepPace,
): Promise<LightScenarioResult> {
  const base = { scenarioId: scenario.id, model: access.model }
  const calls: LightCallRow[] = []
  const turns: LightTurnRow[] = []
  const sent = new Map<number, number>()
  let ids = 0
  const deps: ListeningDeps = {
    settings,
    enabled: async () => true,
    access: async () => access,
    model: { complete: request => model.complete({ ...request, signal: AbortSignal.any([request.signal, signal]) }) },
    context: async () => ({
      agent: PLAYGROUND_AGENT, person: PLAYGROUND_PERSON, recap: scenario.recap,
      exchanges: scenario.exchanges.map(([who, text]) => ({ who, text })),
    }),
    admit: async () => undefined,
    closeTurn: async () => `turn-${scenario.id}`,
    speak: () => `line-${ids++}`,
    speakStored: async (_s, _avoid, pool) => ({ lineId: `line-${ids++}`, text: pool === 'closing' ? '(a stored closing line)' : '(a stored hold phrase)' }),
    // What the browser would wait: hq's schedule.
    send: (_s, e) => { sent.set(e.seq, e.nextCheckSecs) },
    now: () => Date.now(),
    // The bound's own timer never fires here: a scenario's steps say when time has passed.
    later: () => () => undefined,
    log: () => undefined,
  }
  const listening = recordedListening(deps, { call: r => calls.push(r), turn: r => turns.push(r), line: () => undefined }, () => `row-${ids++}`)
  const session: ListeningSession = { conversationId: `light-scenario-${scenario.id}-${access.model}`, holderId: 'playground-person' }
  const steps: LightStepResult[] = []
  let planned = 0
  for (let i = 0; ; i++) {
    const step = i < scenario.steps.length ? scenario.steps[i]! : pace?.next(steps) ?? null
    if (!step) break
    planned++
    if (signal.aborted) break
    const seq = i + 1
    await listening.listen(session, {
      seq, moment: step.moment, text: step.text, quietMs: step.quietMs,
      ...(step.workingMs !== undefined ? { workingMs: step.workingMs } : {}), ...(step.keptOpen ? { keptOpen: true } : {}),
    })
    const call = calls.find(c => c.seq === seq)
    const turn = turns.find(t => t.seq === seq)
    const outcome = {
      choice: call?.choice ?? null, words: call?.words ?? null, answer: call?.answer ?? null, asked: call?.asked ?? null,
      nextCheck: sent.get(seq) ?? null, ms: call?.ms ?? 0, overLimit: call?.overLimit ?? false, tone: call?.tone ?? null,
      // A stored closing line at the limit is a closed turn; its call's choice says it was not the light model's own.
      turn: !turn || turn.outcome === 'notYet' || turn.outcome === 'off' ? 'open' as const : turn.outcome === 'limitClosed' ? 'closed' as const : turn.outcome,
    }
    steps.push({ ...outcome, ...scoreLightStep(step.expect, outcome) })
  }
  return {
    ...base, pass: steps.length === planned && steps.every(s => s.pass), steps,
    inputTokens: calls.reduce((n, c) => n + c.inputTokens, 0), outputTokens: calls.reduce((n, c) => n + c.outputTokens, 0),
  }
}
