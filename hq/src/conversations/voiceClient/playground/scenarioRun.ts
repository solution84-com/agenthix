/**
 * The scenario run as the page shows it (plan task 4c.4), pure: each group's score per model, each line's mark and
 * word, the estimate before a run and the cost after it, and the run's entries in the Log.
 */
import { MODEL_PRICING, type ModelPricing } from '@agenthix/core'
import type { PlaygroundScenario, ScenarioGroup, ScenarioLibrary, ScenarioResult, ScenarioWanted } from '../../../shared/voicePlayground'
import type { LogEntry } from './playgroundLog'

export type StoredResult = ScenarioResult & { at: number }

export type RunState = {
  runId: string | null
  /** The models of the run shown, in the order chosen. */
  models: string[]
  results: Readonly<Record<string, StoredResult>>
  running: boolean
  startedAt: number | null
  endedAt: number | null
}

export const NO_RUN: RunState = { runId: null, models: [], results: {}, running: false, startedAt: null, endedAt: null }

export const resultKey = (scenarioId: string, model: string) => `${scenarioId}\n${model}`

/** What the behaviour wanted reads as, in the line's dialog. */
export const WANTED_WORDS: Record<ScenarioWanted, string> = {
  hold: 'stay quiet (call keep_listening, say nothing)',
  reply: 'answer in words',
  quick: 'answer at once in words, with no tool',
  task: 'say it will do it, then call start_work',
}

export function groupScore(group: ScenarioGroup, model: string, run: RunState): { passed: number; done: number; total: number } {
  let passed = 0
  let done = 0
  for (const s of group.scenarios) {
    const r = run.results[resultKey(s.id, model)]
    if (!r) continue
    done++
    if (r.pass) passed++
  }
  return { passed, done, total: group.scenarios.length }
}

export function totalScore(library: ScenarioLibrary, model: string, run: RunState): number {
  return library.groups.reduce((n, g) => n + groupScore(g, model, run).passed, 0)
}

/** What a result's short word reads as on screen: no tool names; those are in a line's dialog. */
export function didWords(did: string): string {
  if (did === 'held') return 'kept listening'
  if (did === 'called start_work') return 'started the work'
  return did
}

export type Cell = { mark: '✓' | '✗' | '…' | ''; word: string; pass: boolean | null }

export function cellOf(result: ScenarioResult | undefined, running: boolean): Cell {
  if (!result) return running ? { mark: '…', word: 'waiting', pass: null } : { mark: '', word: '', pass: null }
  return { mark: result.pass ? '✓' : '✗', word: result.error ? 'failed' : didWords(result.did), pass: result.pass }
}

/** A line fails when any model's result for it failed. */
export function lineFails(scenario: PlaygroundScenario, run: RunState): boolean {
  return run.models.some(m => run.results[resultKey(scenario.id, m)]?.pass === false)
}

/** The price hq knows for a model the picker names `<providerId>/<model>`; undefined when it has none. */
export function priceFor(value: string): ModelPricing | undefined {
  const model = value.slice(value.indexOf('/') + 1)
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]
  const key = Object.keys(MODEL_PRICING).find(k => k.endsWith(`/${model}`))
  return key ? MODEL_PRICING[key] : undefined
}

/** About what one call writes: a short spoken answer or a tool call. */
export const OUTPUT_TOKENS_PER_CALL = 60

const cost = (p: ModelPricing, input: number, output: number) => (input * p.inputPerMTok + output * p.outputPerMTok) / 1_000_000

/** Calls and, when hq knows every model's price, about what the run costs. */
export function estimate(library: ScenarioLibrary, models: readonly string[], price = priceFor): { scenarios: number; calls: number; dollars: number | null } {
  const scenarios = library.groups.reduce((n, g) => n + g.scenarios.length, 0)
  const prices = models.map(price)
  const dollars = models.length > 0 && prices.every(Boolean)
    ? prices.reduce((n, p) => n + cost(p!, library.inputTokensPerRun, scenarios * OUTPUT_TOKENS_PER_CALL), 0)
    : null
  return { scenarios, calls: scenarios * models.length, dollars }
}

/** What the run's results cost, when hq knows every model's price. */
export function runCost(run: RunState, price = priceFor): number | null {
  let total = 0
  for (const r of Object.values(run.results)) {
    const p = price(r.model)
    if (!p) return null
    total += cost(p, r.inputTokens, r.outputTokens)
  }
  return total
}

export const dollarsText = (n: number) => (n < 0.01 ? 'under $0.01' : `$${n.toFixed(2)}`)

const short = (text: string, max = 48) => (text.length > max ? `…${text.slice(-max).trimStart()}` : text)

/** The run in the Log: a DECISION for each line, and a CALL for the run once it has ended. */
export function runLogEntries(library: ScenarioLibrary | null, run: RunState, labelOf: (model: string) => string, price = priceFor): LogEntry[] {
  if (!library || !run.runId) return []
  const byId = new Map(library.groups.flatMap(g => g.scenarios).map(s => [s.id, s]))
  const out: LogEntry[] = Object.values(run.results).map(r => ({
    id: `scenario-${r.scenarioId}-${r.model}`, at: r.at, badge: 'DECISION',
    title: `${labelOf(r.model)} · “${short(byId.get(r.scenarioId)?.last ?? r.scenarioId)}” → ${r.error ? `failed: ${r.error}` : didWords(r.did)}`,
    after: r.pass ? 'pass' : 'fail',
  }))
  if (run.endedAt !== null) {
    const results = Object.values(run.results)
    const dollars = runCost(run, price)
    const tokens = results.reduce((n, r) => ({ input: n.input + r.inputTokens, output: n.output + r.outputTokens }), { input: 0, output: 0 })
    out.push({
      id: `run-${run.runId}`, at: run.endedAt, badge: 'CALL',
      title: `${results.length} calls · ${dollars === null ? `${tokens.input.toLocaleString()} in · ${tokens.output.toLocaleString()} out` : `about ${dollarsText(dollars)}`}`,
    })
  }
  return out
}
