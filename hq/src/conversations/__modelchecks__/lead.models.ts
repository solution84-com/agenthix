/**
 * The lead's model checks (V1), run by `npm run test:models` only: never in `npm test`, CI's unit suite or the
 * integration suite. README.md beside this says what they check and what to set.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runModelChecks } from './runner'
import { CHECKS } from './checks'
import { checkAsked } from './env'
import { allPassed, report, summaryTable } from './report'

const OUT_DIR = path.resolve(__dirname, '../../../.model-checks')

describe('the lead with a real model', () => {
  it('maps each question to the right place and tool', async ctx => {
    const checks = CHECKS.filter(c => checkAsked(process.env, c.id))
    const result = await runModelChecks(process.env, { out: line => console.log(line) }, checks)
    if ('skipped' in result) return ctx.skip(result.skipped)
    const at = new Date()
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const file = path.join(OUT_DIR, `lead-${at.toISOString().replace(/[:.]/g, '-')}.md`)
    fs.writeFileSync(file, report(result.outcomes, result.checks, result.models, at))
    console.log(`\n${summaryTable(result.outcomes, result.checks, result.models)}\n\nWritten to ${file}`)
    expect(allPassed(result.outcomes), 'a check failed on a model: see the lines above').toBe(true)
  })
})
