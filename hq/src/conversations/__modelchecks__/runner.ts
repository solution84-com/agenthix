/**
 * Runs every check on every model the environment names, each as many times as it asks (or as many as the check
 * itself sets), one at a time. Without the
 * environment it calls nothing and says what to set.
 */
import type { ModelAdapter } from '../contract'
import type { Embedder } from '../../memory/contract'
import { embedderFor } from '../../memory/embedding/embedders'
import { LOCAL_MODEL } from '../../memory/embedding/localEmbedder'
import { createModelAdapter } from '../model'
import { CHECKS, type Check, type Grade } from './checks'
import { checkAccess } from './env'
import { runCheck } from './run'
import { runTaskRunCheck } from './taskRun/run'
import { errorGrade, outcomeLine, type Outcome } from './report'
import { traceOf } from './trace'

export interface RunnerDeps {
  /** The real adapter unless set; tests give one on a fake model. */
  adapter?: ModelAdapter
  /** Each line as it is known. */
  out(line: string): void
  /** What find_tools embeds with: hq's built-in model unless set; null searches by words alone. */
  embedder?: Embedder | null
}

export type RunnerResult = { skipped: string } | { outcomes: Outcome[]; checks: string[]; models: string[] }

export async function runModelChecks(
  env: Readonly<Record<string, string | undefined>>,
  deps: RunnerDeps,
  checks: readonly Check[] = CHECKS,
): Promise<RunnerResult> {
  const access = checkAccess(env)
  if ('skip' in access) {
    deps.out(access.skip)
    return { skipped: access.skip }
  }
  // No ledger row and no provider health: these calls are no one's and change nothing in HQ.
  const adapter = deps.adapter ?? createModelAdapter({ record: () => {}, maxRetries: 2 })
  // A real run searches as a turn does, with hq's built-in model; a fake model's run, by words alone.
  const embedder = deps.embedder !== undefined ? deps.embedder : deps.adapter ? null : embedderFor(LOCAL_MODEL)
  const outcomes: Outcome[] = []
  for (const model of access.accesses) {
    const redact = (line: string) => line.split(model.apiKey).join('[key]')
    for (const check of checks) {
      for (let run = 1; run <= (check.runs ?? access.runs); run++) {
        let grade: Grade
        let firstRequestTokens: number | null = null
        let trace: string[] | null = null
        try {
          const record = await (check.taskRun ? runTaskRunCheck(adapter, model, check.taskRun, undefined, { embedder }) : runCheck(adapter, model, check.setup, undefined, { embedder }))
          firstRequestTokens = record.firstRequestTokens ?? null
          grade = check.grade(record)
          if (!grade.passed) trace = traceOf(record)
        } catch (err) {
          grade = errorGrade(err)
        }
        const outcome: Outcome = { model: model.model, check: check.id, run, grade, kind: check.taskRun ? 'task run' : 'lead' }
        if (check.minPassRate !== undefined) outcome.need = check.minPassRate
        if (firstRequestTokens !== null) outcome.firstRequestTokens = firstRequestTokens
        if (!grade.passed) outcome.grade = { passed: false, why: redact(grade.why) }
        if (trace) outcome.trace = trace.map(redact)
        outcomes.push(outcome)
        deps.out(outcomeLine(outcome))
        for (const line of outcome.trace ?? []) deps.out(`    ${line}`)
      }
    }
  }
  return { outcomes, checks: checks.map(c => c.id), models: access.accesses.map(a => a.model) }
}
