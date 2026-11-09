/**
 * The scenario runner (plan task 4c.4): every scenario of the library, once on each model chosen, through the same
 * lead path as Live (leads.ts `modelLead`: the lead's real context with the voice turn block and the Adaptive voice
 * switch, keep_listening and the stand-in start_work, the spoken first step's reasoning), read by the lead's voice
 * logic, with no speech. A few calls run at once. Development calls: the access carries no costing, so nothing
 * reaches a usage report; the tokens go to the page with each result.
 *
 * The last run's requests are kept in memory, as they were handed to the model adapter, for "Show exactly what was
 * sent"; a new run or Clear results forgets them.
 */
import {
  SCENARIO_CONCURRENCY, SCENARIO_MAX_MODELS, VOICE_PLAYGROUND_SOCKET as P,
  type PlaygroundEntry, type PlaygroundScenario, type ScenarioLibrary, type ScenarioResult, type ScenarioRunAck,
  type ScenarioRunArgs, type ScenarioRunDone, type ScenarioSentAck, type ScenarioSentArgs, type SentRequest,
} from '../../../../shared/voicePlayground'
import type { LeadRequest, ModelAdapter, ResolvedAccess } from '../../../contract'
import { canHold, holdReason, readLeadStep } from '../../../lead/voiceLogic'
import { STARTS_WORK } from '../../../coordinator/startedWords'
import { PLAYGROUND_TOOLS, playgroundContext, type PlaygroundTurn } from '../context'
import type { Out } from '../conversation'
import { modelLead, spokenMessageOf } from '../leads'
import { ALL_SCENARIOS, SCENARIO_GROUPS } from './index'
import { scoreStep } from './score'
import { sentOf } from './sent'

export interface ScenarioRunnerDeps {
  out: Out
  model: ModelAdapter
  /** The access for a model the page named, checked against what this person may use; throws with a line they read. */
  access(userId: string, model: string): Promise<ResolvedAccess>
  cacheKey: string
  concurrency?: number
  now?(): number
  newId?(): string
}

/** The scenario as one spoken turn: its conversation, then the person's last words, voice on. */
export function scenarioTurn(s: PlaygroundScenario, adaptiveVoice: boolean): PlaygroundTurn {
  const at = (i: number) => Date.UTC(2026, 0, 1, 9) + i * 5_000
  const history: PlaygroundEntry[] = s.conversation.map(([who, text], i) => who === 'person'
    ? { id: `${s.id}-${i}`, role: 'person', text, spoken: true, at: at(i) }
    : { id: `${s.id}-${i}`, role: 'agent', text, state: 'COMPLETED', spoken: true, at: at(i) })
  const last: PlaygroundEntry = { id: `${s.id}-last`, role: 'person', text: s.last, spoken: true, at: at(history.length) }
  return { history: [...history, last], answers: [last], listening: true, trailedOff: false, wentOn: false, adaptiveVoice }
}

/** About four characters a token: what one model's run of the library sends, for the estimate before a run. */
export function estimateInputTokens(scenarios: readonly PlaygroundScenario[] = ALL_SCENARIOS): number {
  const tools = PLAYGROUND_TOOLS.reduce((n, t) => n + t.name.length + t.description.length + 200, 0)
  let chars = 0
  for (const s of scenarios) {
    const c = playgroundContext(scenarioTurn(s, true))
    chars += c.system.reduce((n, p) => n + p.text.length, 0) + JSON.stringify(c.messages).length + tools
  }
  return Math.round(chars / 4)
}

type Job = { scenario: PlaygroundScenario; model: string }

export class ScenarioRunner {
  private controller: AbortController | null = null
  private runId: string | null = null
  private sent = new Map<string, SentRequest>()
  private estimate: number | null = null
  private readonly now: () => number
  private readonly newId: () => string

  constructor(private readonly userId: string, private readonly deps: ScenarioRunnerDeps) {
    this.now = deps.now ?? (() => performance.now())
    let n = 0
    this.newId = deps.newId ?? (() => `run-${Date.now().toString(36)}-${(n++).toString(36)}`)
  }

  library(): ScenarioLibrary {
    this.estimate ??= estimateInputTokens()
    return { groups: SCENARIO_GROUPS, inputTokensPerRun: this.estimate }
  }

  run(args: ScenarioRunArgs): ScenarioRunAck {
    const models = Array.isArray(args?.models)
      ? [...new Set(args.models.filter((m): m is string => typeof m === 'string' && m.trim() !== ''))]
      : []
    if (models.length === 0) return { ok: false, error: 'Choose at least one model to compare.' }
    if (models.length > SCENARIO_MAX_MODELS) return { ok: false, error: `Compare at most ${SCENARIO_MAX_MODELS} models at once.` }
    this.clear()
    const runId = this.newId()
    const controller = new AbortController()
    this.runId = runId
    this.controller = controller
    const adaptiveVoice = args.adaptiveVoice !== false
    const accesses = new Map(models.map(m => {
      const access = this.deps.access(this.userId, m)
      access.catch(() => undefined)
      return [m, access] as const
    }))
    // Scenario by scenario, each on every model, so the models' lines fill in together.
    const jobs: Job[] = ALL_SCENARIOS.flatMap(scenario => models.map(model => ({ scenario, model })))
    void this.pool(jobs, job => this.one(runId, job, accesses.get(job.model)!, adaptiveVoice, controller.signal), controller.signal)
      .then(() => {
        if (this.runId === runId) this.controller = null
        this.deps.out(P.scenarioDone, { runId, cancelled: controller.signal.aborted } satisfies ScenarioRunDone)
      })
    return { ok: true, runId, calls: jobs.length }
  }

  sentRequest(args: ScenarioSentArgs): ScenarioSentAck {
    if (!args || args.runId !== this.runId) return { ok: false, error: 'That run is no longer kept.' }
    const sent = this.sent.get(key(args.scenarioId, args.model))
    return sent ? { ok: true, sent } : { ok: false, error: 'Nothing was sent for that line.' }
  }

  /** Stops a run in progress and forgets the last run. */
  clear(): void {
    this.controller?.abort()
    this.controller = null
    this.runId = null
    this.sent.clear()
  }

  private async pool(jobs: Job[], work: (job: Job) => Promise<void>, signal: AbortSignal): Promise<void> {
    let next = 0
    const lane = async () => {
      while (!signal.aborted && next < jobs.length) await work(jobs[next++]!)
    }
    await Promise.all(Array.from({ length: Math.max(1, this.deps.concurrency ?? SCENARIO_CONCURRENCY) }, lane))
  }

  private async one(runId: string, { scenario, model }: Job, access: Promise<ResolvedAccess>, adaptiveVoice: boolean, signal: AbortSignal): Promise<void> {
    const turn = scenarioTurn(scenario, adaptiveVoice)
    const seen: { request?: LeadRequest } = {}
    const recording: ModelAdapter = {
      stream: r => { seen.request = r; return this.deps.model.stream(r) },
      complete: r => this.deps.model.complete(r),
    }
    let text = ''
    let firstAt: number | null = null
    let usage = { inputTokens: 0, outputTokens: 0 }
    const reading = readLeadStep({
      spokenMessage: spokenMessageOf(turn), mayHold: () => canHold([]), replied: () => text, startsWork: STARTS_WORK,
      stream: piece => { text += piece },
      hold: () => undefined,
      finish: e => { usage = { inputTokens: e.usage.inputTokens, outputTokens: e.usage.outputTokens } },
    })
    const started = this.now()
    let error: string | undefined
    try {
      for await (const event of modelLead(model, access, { model: recording, cacheKey: this.deps.cacheKey }).events(turn, signal)) {
        if (signal.aborted) break
        if (firstAt === null && (event.type === 'tool-call' || (event.type === 'text' && event.text.trim()))) firstAt = this.now()
        reading.take(event)
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
    if (signal.aborted || this.runId !== runId) return
    if (seen.request) this.sent.set(key(scenario.id, model), sentOf(seen.request))
    const { held, calls } = reading.result()
    const names = calls.map(c => c.name)
    const score = error ? { pass: false, did: 'failed', wroteFirst: false } : scoreStep(scenario.wanted, { held: held !== null, text, calls: names })
    this.deps.out(P.scenarioResult, {
      runId, scenarioId: scenario.id, model, ...score, text: text.trim(), reason: held ? holdReason(held) : null, calls: names,
      firstOutputMs: firstAt === null ? null : Math.round(firstAt - started), ...usage, ...(error && { error }),
    } satisfies ScenarioResult)
  }
}

const key = (scenarioId: string, model: string) => `${scenarioId}\n${model}`
