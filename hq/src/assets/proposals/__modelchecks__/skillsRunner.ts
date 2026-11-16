/** Runs the skills checks on every model the environment names, each as many times as it asks, one at a time. */
import type { ModelAdapter } from '../../../conversations/contract'
import { createModelAdapter } from '../../../conversations/model'
import { checkAccess } from '../../../conversations/__modelchecks__/env'
import { errorGrade, outcomeLine, type Outcome } from '../../../conversations/__modelchecks__/report'
import type { Grade } from '../../../conversations/__modelchecks__/checks'
import { SKILL_CHECKS, type SkillCheck } from './skillChecks'
import { runSkillsCheck } from './skillsRun'

export interface SkillsRunnerDeps {
  /** The real adapter unless set; tests give one on a fake model. */
  adapter?: ModelAdapter
  out(line: string): void
}

export type SkillsRunnerResult = { skipped: string } | { outcomes: Outcome[]; checks: string[]; models: string[] }

export async function runSkillsChecks(
  env: Readonly<Record<string, string | undefined>>,
  deps: SkillsRunnerDeps,
  checks: readonly SkillCheck[] = SKILL_CHECKS,
): Promise<SkillsRunnerResult> {
  const access = checkAccess(env)
  if ('skip' in access) {
    deps.out(access.skip)
    return { skipped: access.skip }
  }
  const adapter = deps.adapter ?? createModelAdapter({ record: () => {}, maxRetries: 2 })
  const outcomes: Outcome[] = []
  for (const model of access.accesses) {
    for (const check of checks) {
      for (let run = 1; run <= access.runs; run++) {
        let grade: Grade
        let firstRequestTokens: number | null = null
        try {
          const record = await runSkillsCheck(adapter, model, check.ask)
          firstRequestTokens = record.firstRequestTokens ?? null
          grade = check.grade(record)
        } catch (err) {
          grade = errorGrade(err)
        }
        if (!grade.passed) grade = { passed: false, why: grade.why.split(model.apiKey).join('[key]') }
        const outcome: Outcome = { model: model.model, check: check.id, run, grade, kind: 'skills' }
        if (firstRequestTokens !== null) outcome.firstRequestTokens = firstRequestTokens
        outcomes.push(outcome)
        deps.out(outcomeLine(outcome))
      }
    }
  }
  return { outcomes, checks: checks.map(c => c.id), models: access.accesses.map(a => a.model) }
}
