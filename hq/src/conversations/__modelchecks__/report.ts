/**
 * The checks' result: one line per model, check and run, then a table, then the first request's size. A check passes
 * for a model only when every run of it does, or, for a check that asks for a rate, when that share of its runs does.
 */
import type { Grade } from './checks'

/** What a check sends: the lead's turn, a task's run on a branch, or an agent with skills. */
export type CheckKind = 'lead' | 'task run' | 'skills'

export interface Outcome {
  model: string
  check: string
  run: number
  grade: Grade
  kind?: CheckKind
  /** The share of the check's runs that must pass; every run when absent. */
  need?: number
  /** The provider's own count of the run's first model call's input, when it gave one. */
  firstRequestTokens?: number
  /** What a failed run did (trace.ts), written under its line in the report. */
  trace?: string[]
}

const runsOf = (outcomes: readonly Outcome[], model: string, check: string) => outcomes.filter(o => o.model === model && o.check === check)
const metBy = (runs: readonly Outcome[]) => runs.filter(o => o.grade.passed).length / runs.length >= (runs[0]?.need ?? 1)

export function outcomeLine(o: Outcome): string {
  return `${o.model} · ${o.check} · run ${o.run}: ${o.grade.passed ? 'passed' : `failed: ${o.grade.why}`}`
}

/** A model failing a check because its call failed is not the model's answer: the line says so. */
export function errorGrade(err: unknown): Grade {
  const reason = err instanceof Error ? err.message : 'the call failed'
  return { passed: false, why: `the model call failed: ${reason}` }
}

export function summaryTable(outcomes: readonly Outcome[], checks: readonly string[], models: readonly string[]): string {
  const cell = (model: string, check: string) => {
    const runs = runsOf(outcomes, model, check)
    const passed = runs.filter(o => o.grade.passed).length
    if (runs.length === 0) return 'not run'
    if (runs[0]?.need === 0) return `measured ${passed}/${runs.length}`
    return `${metBy(runs) ? 'passes' : 'fails'} ${passed}/${runs.length}`
  }
  const rows = [
    `| Check | ${models.join(' | ')} |`,
    `|---|${models.map(() => '---').join('|')}|`,
    ...checks.map(check => `| ${check} | ${models.map(m => cell(m, check)).join(' | ')} |`),
  ]
  return rows.join('\n')
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
}

/**
 * "First request, tokens": per kind of check, each check's median over its runs of the provider's own count of the
 * first call's input, for each model. Empty when no run reported one.
 */
export function firstRequestSection(outcomes: readonly Outcome[], models: readonly string[]): string[] {
  const kinds: CheckKind[] = ['lead', 'task run', 'skills']
  const lines: string[] = []
  for (const kind of kinds) {
    const checks = [...new Set(outcomes.filter(o => o.kind === kind && o.firstRequestTokens !== undefined).map(o => o.check))]
    if (checks.length === 0) continue
    const cell = (model: string, check: string) => {
      const counts = runsOf(outcomes, model, check).flatMap(o => (o.firstRequestTokens === undefined ? [] : [o.firstRequestTokens]))
      return counts.length === 0 ? 'none' : String(median(counts))
    }
    lines.push(
      `| ${kind === 'lead' ? "The lead's checks" : kind === 'task run' ? "The task-run checks" : 'The skills checks'} | ${models.join(' | ')} |`,
      `|---|${models.map(() => '---').join('|')}|`,
      ...checks.map(check => `| ${check} | ${models.map(m => cell(m, check)).join(' | ')} |`),
      '',
    )
  }
  return lines.length === 0 ? [] : ['## First request, tokens', '', 'The median over runs of the provider\'s own input count for the first model call.', '', ...lines]
}

export function report(outcomes: readonly Outcome[], checks: readonly string[], models: readonly string[], at: Date): string {
  return [
    `# Model checks, ${at.toISOString()}`,
    '',
    ...outcomes.flatMap(o => [outcomeLine(o), ...(o.grade.passed ? [] : (o.trace ?? []).map(line => `    ${line}`))]),
    '',
    summaryTable(outcomes, checks, models),
    '',
    ...firstRequestSection(outcomes, models),
  ].join('\n')
}

export function allPassed(outcomes: readonly Outcome[]): boolean {
  const groups = new Set(outcomes.map(o => `${o.model}\u0000${o.check}`))
  return [...groups].every(g => {
    const [model, check] = g.split('\u0000') as [string, string]
    return metBy(runsOf(outcomes, model, check))
  })
}
