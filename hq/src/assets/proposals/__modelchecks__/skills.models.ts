/**
 * The skills checks (skillChecks.ts), run by `npm run test:models` only, with the same environment as the lead's checks
 * (src/conversations/__modelchecks__/README.md): the baseline model, each check as many times as MODEL_CHECK_RUNS asks.
 * Up to 6 model calls per run, each a few thousand tokens. The result is printed and written to `hq/.model-checks/`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkAsked } from '../../../conversations/__modelchecks__/env'
import { allPassed, report, summaryTable } from '../../../conversations/__modelchecks__/report'
import { SKILL_CHECKS } from './skillChecks'
import { runSkillsChecks } from './skillsRunner'

const OUT_DIR = path.resolve(__dirname, '../../../../.model-checks')

describe('an agent with skills, with a real model', () => {
  it('proposes, loads, reads and names skills as it should', async ctx => {
    const checks = SKILL_CHECKS.filter(c => checkAsked(process.env, c.id))
    if (checks.length === 0) return ctx.skip('MODEL_CHECK_ONLY names none of the skills checks')
    const result = await runSkillsChecks(process.env, { out: line => console.log(line) }, checks)
    if ('skipped' in result) return ctx.skip(result.skipped)
    const at = new Date()
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const file = path.join(OUT_DIR, `skills-${at.toISOString().replace(/[:.]/g, '-')}.md`)
    fs.writeFileSync(file, report(result.outcomes, result.checks, result.models, at))
    console.log(`\n${summaryTable(result.outcomes, result.checks, result.models)}\n\nWritten to ${file}`)
    expect(allPassed(result.outcomes), 'a check failed on a model: see the lines above').toBe(true)
  })
})
