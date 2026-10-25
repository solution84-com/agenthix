/**
 * The checks' result: one line per model, check and run, then a table. A check passes for a model only when every
 * run of it does.
 */
import type { Grade } from './checks'

export interface Outcome { model: string; check: string; run: number; grade: Grade }

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
    const runs = outcomes.filter(o => o.model === model && o.check === check)
    const passed = runs.filter(o => o.grade.passed).length
    return runs.length === 0 ? 'not run' : `${passed === runs.length ? 'passes' : 'fails'} (${passed}/${runs.length})`
  }
  const rows = [
    `| Check | ${models.join(' | ')} |`,
    `|---|${models.map(() => '---').join('|')}|`,
    ...checks.map(check => `| ${check} | ${models.map(m => cell(m, check)).join(' | ')} |`),
  ]
  return rows.join('\n')
}

export function report(outcomes: readonly Outcome[], checks: readonly string[], models: readonly string[], at: Date): string {
  return [
    `# Model checks, ${at.toISOString()}`,
    '',
    ...outcomes.map(outcomeLine),
    '',
    summaryTable(outcomes, checks, models),
    '',
  ].join('\n')
}

export function allPassed(outcomes: readonly Outcome[]): boolean {
  return outcomes.every(o => o.grade.passed)
}
